import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';
// MatCheckboxModule y MatSlideToggleModule: sacados (Fase 2) — sin uso real
// (MatCheckboxModule ni siquiera tenía un <mat-checkbox> en ningún template;
// ver CheckboxComponent/SlideToggleComponent de shared-utils, que reemplazan
// el patrón .checkbox-row/.toggle-switch que ya vivía en org-wizard).
import { CardColaboradorComponent, CardComponent, CardTitleDirective, CardFooterDirective, SearchableCardSelectComponent, BadgeComponent, ModalComponent, ModalTitleDirective, ModalActionsDirective, LoaderComponent, CheckboxComponent, SlideToggleComponent, TooltipDirective } from 'shared-utils';

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
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatTabsModule,
    MatMenuModule,
    MatDividerModule,
    MatRadioModule,
    MatChipsModule,
    MatExpansionModule,
    MatCardModule,
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
  ],
})
export class OrganizationModule {}

