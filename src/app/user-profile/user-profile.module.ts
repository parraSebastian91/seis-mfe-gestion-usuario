import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UserProfileRoutingModule } from './user-profile-routing.module';
import { ViewComponent } from './view/view.component';
import { EditComponent } from './edit/edit.component';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonComponent, CardComponent, CardFooterDirective, CardTitleDirective, ChipComponent, FormFieldComponent, FormFieldErrorDirective, IconButtonComponent, IconComponent, InputComponent, InputSuffixDirective, LoaderComponent, PasswordStrengthMeterComponent, SelectComponent, TooltipDirective } from 'shared-utils';

@NgModule({
  declarations: [
    ViewComponent,
    EditComponent
  ],
  imports: [
    CommonModule,
    UserProfileRoutingModule,
    ReactiveFormsModule,
    RouterModule,
    CardComponent, CardTitleDirective, CardFooterDirective,
    PasswordStrengthMeterComponent,
    ButtonComponent,
    IconButtonComponent,
    IconComponent,
    LoaderComponent,
    ChipComponent,
    FormFieldComponent,
    FormFieldErrorDirective,
    InputComponent,
    InputSuffixDirective,
    SelectComponent,
    TooltipDirective,
  ]
})
export class UserProfileModule { }
