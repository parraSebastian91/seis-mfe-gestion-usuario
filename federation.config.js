const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');
const { sharedConfig } = require('../../shared-federation.config');

module.exports = withNativeFederation({

  name: 'seis-mfe-gestion-usuario',

  exposes: {
    './UserProfileRoutingModule': 'projects/seis-mfe-gestion-usuario/src/app/user-profile/user-profile-routing.module.ts',
  },

  shared: sharedConfig,

  // shared: {
  //   ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  //   '@angular/material/menu': { singleton: true, strictVersion: true, requiredVersion: 'auto' },
  // },

  skip: [
    '@angular/material',
    '@angular/material-moment-adapter',
    '@angular/material/core',
    '@angular/material/datepicker',
    '@angular/material/form-field',
    '@angular/material/input',
    '@angular/material/icon',
    '@angular/cdk',
    '@angular/cdk/overlay',
    '@angular/cdk/portal',
    '@angular/cdk/a11y',
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    // Add further packages you don't need at runtime
  ]

  // Please read our FAQ about sharing libs:
  // https://shorturl.at/jmzH0

});
