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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { OrganizationRoutingModule } from './organization-routing.module';
import { OrgListComponent } from './org-list/org-list.component';
import { OrgWizardComponent } from './org-wizard/org-wizard.component';
import { OrgProfileComponent } from './org-profile/org-profile.component';
import { OrgGestorComponent } from './org-gestor/org-gestor.component';
import { AdminMiembrosComponent } from './org-gestor/admin-miembros/admin-miembros.component';
import { AdminSolicitudesComponent } from './org-gestor/admin-solicitudes/admin-solicitudes.component';
import { AdminGruposComponent } from './org-gestor/admin-grupos/admin-grupos.component';
import { AdminGrupoDetalleComponent } from './org-gestor/admin-grupos/admin-grupo-detalle.component';

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
    MatTooltipModule,
    MatCheckboxModule,
    MatRadioModule,
    MatChipsModule,
    MatExpansionModule,
    MatCardModule,
    MatSlideToggleModule,
  ],
})
export class OrganizationModule {}

