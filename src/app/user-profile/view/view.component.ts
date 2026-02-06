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

  logout() {
    // Aquí puedes agregar la lógica para cerrar sesión, como limpiar tokens, redirigir, etc.
    console.log('Cerrar sesión');
  }

  goTo(edit: string) {
    // Aquí puedes agregar la lógica para navegar a la página de edición, por ejemplo usando el router
    console.log('Navegar a:', edit);
  }
}
