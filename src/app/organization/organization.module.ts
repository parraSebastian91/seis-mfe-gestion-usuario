import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
// MatCheckboxModule y MatSlideToggleModule: sacados (Fase 2) — sin uso real
// (MatCheckboxModule ni siquiera tenía un <mat-checkbox> en ningún template;
// ver CheckboxComponent/SlideToggleComponent de shared-utils, que reemplazan
// el patrón .checkbox-row/.toggle-switch que ya vivía en org-wizard).
import {
  CardColaboradorComponent, CardComponent, CardTitleDirective, CardFooterDirective,
  SearchableCardSelectComponent, BadgeComponent, ModalComponent, ModalTitleDirective,
  ModalActionsDirective, LoaderComponent, CheckboxComponent, SlideToggleComponent,
  TooltipDirective, FormFieldComponent, FormFieldErrorDirective, InputComponent,
  InputSuffixDirective, SelectComponent, ButtonComponent, IconComponent, IconButtonComponent,
  MenuComponent,
} from 'shared-utils';

import { OrganizationRoutingModule } from './organization-routing.module';
import { OrgListComponent } from './org-list/org-list.component';
import { OrgWizardComponent } from './org-wizard/org-wizard.component';
import { OrgProfileComponent } from './org-profile/org-profile.component';
import { OrgGestorComponent } from './org-gestor/org-gestor.component';
import { AdminMiembrosComponent } from './org-gestor/admin-miembros/admin-miembros.component';
import { AdminSolicitudesComponent } from './org-gestor/admin-solicitudes/admin-solicitudes.component';
import { AdminGruposComponent } from './org-gestor/admin-grupos/admin-grupos.component';
import { AdminGrupoDetalleComponent } from './org-gestor/admin-grupos/admin-grupo-detalle.component';
import { AdmOrganizacionComponent } from './org-gestor/adm-organizacion/adm-organizacion.component';

@NgModule({
  declarations: [
    OrgListComponent,
    OrgWizardComponent,
    OrgProfileComponent,
    OrgGestorComponent,
    AdminMiembrosComponent,
    AdminSolicitudesComponent,
    AdminGruposComponent,
    AdminGrupoDetalleComponent,
    AdmOrganizacionComponent,
  ],
  imports: [
    CommonModule,
    OrganizationRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatRadioModule,
    MatChipsModule,
    MatExpansionModule,
    CardColaboradorComponent,
    CardComponent,
    CardTitleDirective,
    CardFooterDirective,
    SearchableCardSelectComponent,
    BadgeComponent,
    ModalComponent,
    ModalTitleDirective,
    ModalActionsDirective,
    LoaderComponent,
    CheckboxComponent,
    SlideToggleComponent,
    TooltipDirective,
    FormFieldComponent,
    FormFieldErrorDirective,
    InputComponent,
    InputSuffixDirective,
    SelectComponent,
    ButtonComponent,
    IconComponent,
    IconButtonComponent,
    MenuComponent,
  ],
})
export class OrganizationModule {}

