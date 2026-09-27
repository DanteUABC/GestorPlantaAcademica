import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1E40AF',       // Deep Indigo
          secondary: '#0D9488',     // Teal
          accent: '#4F46E5',        // Violet Indigo
          info: '#0284C7',          // Sky Blue
          success: '#10B981',       // Emerald
          warning: '#F59E0B',       // Amber
          error: '#EF4444',         // Rose Red
          background: '#F8FAFC',    // Slate 50
          surface: '#FFFFFF',
        }
      }
    }
  }
});

export default vuetify;
