# Pruebas frontend EVALUNIA

Este paquete agrega pruebas iniciales para el frontend con Jest + jsdom.

## Archivos incluidos

- `jest.frontend.config.js`
- `frontend/__tests__/helpers/setupFrontendTests.js`
- `frontend/__tests__/frontend_structure.test.js`
- `frontend/__tests__/frontend_dom_smoke.test.js`
- `frontend/__tests__/frontend_browser_scripts_smoke.test.js`
- `frontend/__tests__/frontend_static_contract.test.js`

## Instalación

Desde la raíz del proyecto, instala dependencias de prueba:

```bash
npm install --save-dev jest jest-environment-jsdom jsdom
```

Agrega este script en tu `package.json`:

```json
{
  "scripts": {
    "test:frontend": "jest --config jest.frontend.config.js --coverage"
  }
}
```

Luego ejecuta:

```bash
npm run test:frontend
```

## SonarCloud

Jest genera cobertura en:

```text
coverage/frontend/lcov.info
```

Para SonarCloud, agrega o combina:

```properties
sonar.javascript.lcov.reportPaths=coverage/frontend/lcov.info
```
