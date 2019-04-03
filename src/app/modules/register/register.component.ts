import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { UserService, ImapService, UIService } from '../../shared';
import { MatHorizontalStepper } from '@angular/material/stepper';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

declare var require: any;

@Component({
    selector: 'app-register',
    templateUrl: './register.component.html',
    styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
    @ViewChild('stepper') stepper: MatHorizontalStepper
    mailFormGroup: FormGroup;
    passwordFormGroup: FormGroup;
    customImapFormGroup: FormGroup;
    customProvider: boolean = false;
    editable: boolean = true;
    showPrivacy: boolean = false;
    hasError: boolean = false;
    errorMessage: string = "";
    rewardOnlyRegister: boolean = false;
    imapResponded: boolean = false;
    version: string = require('../../../../package.json').version;


    constructor(
        private _formBuilder: FormBuilder,
        private _userService: UserService,
        private _imapService: ImapService,
        private _uiService: UIService,
        private _route: ActivatedRoute,
        private _router: Router) { }


    ngOnInit() {
        this.mailFormGroup = this._formBuilder.group({
            email: new FormControl('', Validators.compose([
                Validators.required,
                Validators.pattern('^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+.[a-zA-Z0-9-.]+\.[a-z]{2,4}$')
            ]))
        });
        this.passwordFormGroup = this._formBuilder.group({
            password: ['', Validators.required],
            rememberMe: ['true']
        });

        this.customImapFormGroup = this._formBuilder.group({
            imaphost: ['', Validators.required],
            smtphost: ['', Validators.required],
            username: ['', Validators.required],
            password: ['', Validators.required],
            trashBoxPath: ['Trash'],
            rememberMe: ['true']
        });

        //check if reward join only, so user already exists
        var self = this;
        let id = this._route.snapshot.paramMap.get('step');
        if (id == "3") {

            setTimeout(function () {
                self.stepper.reset();

                var userConfig = self._userService.createOrLoadConfig();
                self.rewardOnlyRegister = true;
                self.mailFormGroup.patchValue({ email: userConfig.email });
                self.passwordFormGroup.patchValue({ password: userConfig.password });
                self.editable = false;


                self.stepper.next();
                self.stepper.next();
                self.stepper.next();
            }, 200);
        }
    }

    mailEntered() {
        this.customImapFormGroup.patchValue({
            username: this.mailFormGroup.value.email,
        });
    }

    async doRegister(joinReward: boolean) {

        if (joinReward) {
            //call something
            try {
                var res = await this._userService.registerRewards(this.mailFormGroup.value.email);
            } catch (error) {
                console.log(error);
            }
        }

        var userConfig = this._userService.createOrLoadConfig();
        if (!this.rewardOnlyRegister) {
            //set config
            userConfig.firsttime = false;
            userConfig.hasJoinedRewardProgram = joinReward;
            userConfig.trashBoxPath = this.customImapFormGroup.value.trashBoxPath;
            if (joinReward)
                userConfig.rewardJoinDate = Date.now();

            if (this.customProvider) {
                userConfig.imapurl = this.customImapFormGroup.value.imaphost.split(':')[0];
                userConfig.imapport = this.customImapFormGroup.value.imaphost.split(':').length > 1 ? this.customImapFormGroup.value.imaphost.split(':')[1] : 993;
                userConfig.smtpurl = this.customImapFormGroup.value.smtphost.split(':')[0];
                userConfig.smtpport = this.customImapFormGroup.value.smtphost.split(':').length > 1 ? this.customImapFormGroup.value.smtphost.split(':')[1] : 587;
                userConfig.isGmailProvider = false;
                userConfig.username = this.customImapFormGroup.value.username;
                userConfig.email = this.mailFormGroup.value.email;
            } else {
                userConfig.isGmailProvider = true;
                userConfig.email = this.mailFormGroup.value.email;
                userConfig.username = this.mailFormGroup.value.email;
            }

            //save config
            this._userService.save(userConfig, this.customProvider ? this.customImapFormGroup.value.password : this.passwordFormGroup.value.password);
        } else {
            userConfig.hasJoinedRewardProgram = joinReward;
            if (joinReward)
                userConfig.rewardJoinDate = Date.now();

            this._userService.save(userConfig);
        }

        //navigate to home
        this._router.navigateByUrl('/');

    }


    async verifiy() {
        var imaphost = this.customProvider ? this.customImapFormGroup.value.imaphost.split(':')[0] : "imap.gmail.com";
        var imapport = this.customProvider ? this.customImapFormGroup.value.imaphost.split(':').length > 1 ? this.customImapFormGroup.value.imaphost.split(':')[1] : 993 : 993;
        var self = this;

        try {
            //start checker for timeout because of e.g. invalid hostnames... WORKAROUND
            setTimeout(function () {
                if (!self.imapResponded) {
                    //looks like error
                    self._uiService.showAlert("Something goes wrong! Please check your imap host settings.");
                    //self.stepper.selected.reset();
                    self.stepper.previous();
                }
            }, 5000);

            //create imap client
            await this._imapService.create(this.customProvider ?
                this.customImapFormGroup.value.username : this.mailFormGroup.value.email,
                this.customProvider ?
                    this.customImapFormGroup.value.password : this.passwordFormGroup.value.password, imaphost, imapport);


            this.imapResponded = true;

            //try to connect
            await this._imapService.open();

            //read out trash mailbox path
            var mboxes = await this._imapService.getMailBoxes();
            var gmailBoxes = mboxes.children.filter(function (e) {
                return e.name == "[Gmail]";
            });
            if (gmailBoxes.length > 0) {
                var trashBox = findMailboxWithFlag("Trash", gmailBoxes[0]);
                this.customImapFormGroup.value.trashBoxPath = trashBox == null ? "Trash" : trashBox.path;
            } else {
                var path = "";
                for (var index in mboxes.children) {
                    var node = mboxes.children[index];
                    for (var i = 0; i < node.flags.length; i++) {
                        if (typeof node.flags[i] === 'string' || node.flags[i] instanceof String) {
                            if (node.flags[i].indexOf('Trash') != -1) {
                                path = node.path;
                                break;
                            }
                        }
                    }
                }

                this.customImapFormGroup.value.trashBoxPath = path == "" ? "Trash" : path;
            }

            //close after connection without error
            await this._imapService.close();

            //disable editing for previous steps 
            this.editable = false;

            //set stepper to next step
            this.stepper.next();
        } catch (error) {
            this.imapResponded = true;

            var errorMsg = 'Something goes wrong! ';
            if (this.customProvider) {
                errorMsg += 'Please check your imap settings and try again.';
            } else {
                errorMsg += 'Please check your email address and password and try again.';
            }

            //show error as alert
            this._uiService.showAlert(errorMsg, (error.data ? error.data.message : error));

            //set stepper to previous step
            this.stepper.previous();
        }
    }
}


function findMailboxWithFlag(flag, currentNode) {

    if (flag === currentNode.flag) {
        return currentNode;
    } else {
        for (var index in currentNode.children) {
            var node = currentNode.children[index];
            for (var i = 0; i < node.flags.length; i++) {
                if (typeof node.flags[i] === 'string' || node.flags[i] instanceof String) {
                    if (node.flags[i].indexOf('Trash') != -1) {
                        node.flag = flag;
                        return node;
                    }
                }
            }
            findMailboxWithFlag(flag, node);
        }
        return "No Node Present";
    }
}