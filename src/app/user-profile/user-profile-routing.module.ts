import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ViewComponent } from './view/view.component';
import { EditComponent } from './edit/edit.component';

const routes: Routes = [
  {
    path: 'perfil',
    component: ViewComponent
  },
  {
    path: 'u/:username',
    component: ViewComponent
  },
  {
    path: 'edit-profile',
    component: EditComponent
  },
  {
    path: 'organizaciones',
    loadChildren: () =>
      import('../organization/organization.module').then(m => m.OrganizationModule),
  },
  {
    path: '',
    redirectTo: 'perfil',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserProfileRoutingModule { }
