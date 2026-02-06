import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UserProfileRoutingModule } from './user-profile-routing.module';
import { ViewComponent } from './view/view.component';
import { EditComponent } from './edit/edit.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [
    ViewComponent,
    EditComponent
  ],
  imports: [
    CommonModule,
    UserProfileRoutingModule,
    MatMenuModule,
    MatIconModule,
    MatDividerModule,
    RouterModule

  ]
})
export class UserProfileModule { }
