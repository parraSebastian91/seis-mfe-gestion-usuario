import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OrgListComponent } from './org-list/org-list.component';
import { OrgWizardComponent } from './org-wizard/org-wizard.component';
import { OrgProfileComponent } from './org-profile/org-profile.component';
import { OrgGestorComponent } from './org-gestor/org-gestor.component';
import { AdminMiembrosComponent } from './org-gestor/admin-miembros/admin-miembros.component';
import { AdminSolicitudesComponent } from './org-gestor/admin-solicitudes/admin-solicitudes.component';
import { AdminGruposComponent } from './org-gestor/admin-grupos/admin-grupos.component';
import { AdminGrupoDetalleComponent } from './org-gestor/admin-grupos/admin-grupo-detalle.component';

const routes: Routes = [
  { path: '', component: OrgListComponent },
  { path: 'nueva', component: OrgWizardComponent },
  {
    path: ':id/gestor',
    component: OrgGestorComponent,
    children: [
      { path: '',             redirectTo: 'miembros', pathMatch: 'full' },
      { path: 'miembros',     component: AdminMiembrosComponent },
      { path: 'solicitudes',  component: AdminSolicitudesComponent },
      { path: 'grupos',       component: AdminGruposComponent },
      { path: 'grupos/:grupoId', component: AdminGrupoDetalleComponent },
      { path: 'configuracion', redirectTo: 'miembros', pathMatch: 'full' },
    ],
  },
  { path: ':id', component: OrgProfileComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrganizationRoutingModule {}
