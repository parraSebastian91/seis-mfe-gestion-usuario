import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ViewComponent } from './user-profile/view/view.component';
import { EditComponent } from './user-profile/edit/edit.component';

const routes: Routes = [
  {
    path: "",
    loadChildren: () => import('./user-profile/user-profile.module').then(m => m.UserProfileModule)
  },
  {
    redirectTo: "view-profile",
    pathMatch: "full",
    path: ""
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
