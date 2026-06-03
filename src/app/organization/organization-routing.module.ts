import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OrgListComponent } from './org-list/org-list.component';
import { OrgWizardComponent } from './org-wizard/org-wizard.component';
import { OrgProfileComponent } from './org-profile/org-profile.component';

const routes: Routes = [
  { path: '', component: OrgListComponent },
  { path: 'nueva', component: OrgWizardComponent },
  { path: ':id', component: OrgProfileComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrganizationRoutingModule {}
