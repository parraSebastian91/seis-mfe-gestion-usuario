import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: "",
    loadChildren: () => import('./user-profile/user-profile.module').then(m => m.UserProfileModule)
  },
  {
    redirectTo: "view-profile",
    pathMatch: "full",
    path: "**"
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
