import { Component } from '@angular/core';

@Component({
  selector: 'app-view',
  standalone: false,
  templateUrl: './view.component.html',
  styleUrl: './view.component.scss'
})
export class ViewComponent {
  // Datos del usuario (estos pueden venir de un servicio)
  userName: string = 'María González Pérez';
  userEmail: string = 'maria.gonzalez@empresa.com';
  userPosition: string = 'Gerente de Proyectos';
}
