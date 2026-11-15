// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { pwaOptions } from '../../vite.config';

describe('PWA Configuration & Workbox Strategies (Tarea 1)', () => {
  describe('Configuración General de VitePWA', () => {
    it('debe tener configurado registerType en autoUpdate', () => {
      expect(pwaOptions.registerType).toBe('autoUpdate');
    });

    it('debe incluir los activos esenciales en includeAssets', () => {
      expect(pwaOptions.includeAssets).toContain('favicon.ico');
      expect(pwaOptions.includeAssets).toContain('pwa-192x192.png');
      expect(pwaOptions.includeAssets).toContain('pwa-512x512.png');
    });
  });

  describe('Web App Manifest', () => {
    it('debe contener el nombre institucional y valores correctos', () => {
      expect(pwaOptions.manifest.name).toBe('Pavilion - Gestor de Planta Académica');
      expect(pwaOptions.manifest.short_name).toBe('Pavilion');
      expect(pwaOptions.manifest.description).toBe('Sistema de Gestión de Planta Académica y Horarios');
      expect(pwaOptions.manifest.theme_color).toBe('#1976D2');
      expect(pwaOptions.manifest.background_color).toBe('#ffffff');
      expect(pwaOptions.manifest.display).toBe('standalone');
      expect(pwaOptions.manifest.start_url).toBe('/');
    });

    it('debe definir iconos de 192x192 y 512x512', () => {
      const icons = pwaOptions.manifest.icons;
      expect(Array.isArray(icons)).toBe(true);

      const icon192 = icons.find(i => i.sizes === '192x192');
      expect(icon192).toBeDefined();
      expect(icon192.src).toContain('192x192');
      expect(icon192.type).toBe('image/png');

      const icon512 = icons.find(i => i.sizes === '512x512');
      expect(icon512).toBeDefined();
      expect(icon512.src).toContain('512x512');
      expect(icon512.type).toBe('image/png');
    });
  });

  describe('Estrategias de Caché de Workbox', () => {
    it('debe incluir fuentes MDI y activos estáticos en globPatterns para precache del App Shell', () => {
      const globPattern = pwaOptions.workbox.globPatterns.join(',');
      // Debe incluir fuentes para Vuetify MDI (@mdi/font)
      expect(globPattern).toContain('woff');
      expect(globPattern).toContain('woff2');
      expect(globPattern).toContain('ttf');
      expect(globPattern).toContain('eot');
      // Debe incluir bundles JS, CSS y HTML
      expect(globPattern).toContain('js');
      expect(globPattern).toContain('css');
      expect(globPattern).toContain('html');
      expect(globPattern).toContain('ico');
      expect(globPattern).toContain('png');
    });

    it('debe configurar la regla runtimeCaching con NetworkFirst y cacheName "api-cache-v1"', () => {
      const cachingRules = pwaOptions.workbox.runtimeCaching;
      expect(Array.isArray(cachingRules)).toBe(true);

      const apiRule = cachingRules.find(r => r.options?.cacheName === 'api-cache-v1');
      expect(apiRule).toBeDefined();
      expect(apiRule.handler).toBe('NetworkFirst');
      expect(apiRule.options.networkTimeoutSeconds).toBe(4);
      expect(apiRule.options.expiration.maxEntries).toBe(50);
      expect(apiRule.options.expiration.maxAgeSeconds).toBe(86400);
      expect(apiRule.options.cacheableResponse.statuses).toEqual([0, 200]);
    });

    it('la regla urlPattern de api-cache-v1 debe coincidir con schedules/coordinator, teachers y classrooms', () => {
      const apiRule = pwaOptions.workbox.runtimeCaching.find(r => r.options?.cacheName === 'api-cache-v1');
      const pattern = apiRule.urlPattern;

      // Casos válidos que DEBEN hacer match
      expect(pattern.test('/api/schedules/coordinator')).toBe(true);
      expect(pattern.test('/api/schedules/coordinator/')).toBe(true);
      expect(pattern.test('/api/schedules/coordinator?tenant_id=tenant-itc')).toBe(true);
      expect(pattern.test('http://localhost:5000/api/schedules/coordinator')).toBe(true);

      expect(pattern.test('/api/teachers')).toBe(true);
      expect(pattern.test('/api/teachers/')).toBe(true);
      expect(pattern.test('/api/teachers?active=true')).toBe(true);
      expect(pattern.test('http://localhost:5000/api/teachers')).toBe(true);

      expect(pattern.test('/api/classrooms')).toBe(true);
      expect(pattern.test('/api/classrooms/')).toBe(true);
      expect(pattern.test('/api/classrooms?type=Aula')).toBe(true);
      expect(pattern.test('http://localhost:5000/api/classrooms')).toBe(true);

      // Casos que NO deben hacer match (rutas mutadoras, login, u otras)
      expect(pattern.test('/api/auth/login')).toBe(false);
      expect(pattern.test('/api/subjects')).toBe(false);
      expect(pattern.test('/api/analytics/workload')).toBe(false);
    });
  });

  describe('Registro del Service Worker en main.js', () => {
    it('debe importar registerSW de virtual:pwa-register y registrarlo inmediatamente', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const mainContent = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf-8');
      expect(mainContent).toContain("import { registerSW } from 'virtual:pwa-register'");
      expect(mainContent).toContain("registerSW({ immediate: true })");
    });
  });
});
