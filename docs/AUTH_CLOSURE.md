# BioFold 3D — cierre de autenticación y QA (2026-08-31)

## Entregado

- Supabase Auth real en `src/`: email/password, Google PKCE, confirmación, recuperación, perfil y logout. No existe un proveedor ficticio de producción.
- Callback de intercambio único, limpieza temprana de credenciales y destinos privados allowlisted.
- Recuperación autorizada sólo por el resultado verificado del SDK o `token_hash`; fragmentos implicit, sesiones ordinarias y texto `type=recovery` no conceden cambios de contraseña.
- Sesiones almacenadas aceptadas sólo después de `getUser`; guards de generación impiden restauración tardía tras logout o cambio de usuario.
- QA product-like sobre el SDK instalado, con Supabase simulado únicamente en HTTP y sin salida a proyectos, usuarios, Google o SMTP reales.
- Entorno normal sin `.env` ficticio. QA usa builds, puertos, host `.test` y configuración propios; unitarias y E2E ignoran `.env.local`.

## Verificación final

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | 209 passed / 19 files |
| `pnpm build` | Passed |
| `pnpm test:e2e` | 51 passed en una sola ejecución |
| `git diff --check` | Passed |

La ejecución unitaria y la E2E recibieron `VITE_SUPABASE_URL=https://must-not-be-used.example.test` como canario del proceso. Ambas continuaron usando su configuración explícitamente aislada; Playwright habría bloqueado y reportado cualquier petición Auth a ese host.

Los 51 casos cubren 35 flujos de plataforma/configuración, 6 revisiones visuales y de accesibilidad, 4 casos de ciclo de vida del laboratorio y 6 smoke tests humano/agente. En particular, recuperación comprueba cambio efectivo, logout, rechazo de la contraseña anterior, aceptación de la nueva y recarga autenticada. Confirmación comprueba link inicial, reenvío con un nuevo verifier, vencimiento y reutilización. Google automatiza hasta el límite del proveedor: scopes, S256, callback y retorno interno.

Advertencias conocidas sin fallo: el bundle distribuido de 3Dmol usa `eval`, el chunk diferido del laboratorio supera 500 kB y Node imprime una advertencia experimental de `localStorage` durante Vitest.

## Aceptación real pendiente

El 2026-09-01 se configuró el `.env.local` ignorado por Git con valores públicos proporcionados por el propietario. El conector confirmó **BioFold** (`wkrpwardtbeluwzutjyp`) como `ACTIVE_HEALTHY`; su URL coincide y existe una publishable key activa. `/auth/v1/settings` respondió HTTP 200: registro por email habilitado, confirmación requerida y Google deshabilitado. La build real incorporó el origen correcto y `/login` mostró acciones habilitadas sin errores de consola.

Falta comprobar la allowlist de callbacks, configurar Google/SMTP y ejecutar signup, confirmación y recuperación con una cuenta controlada por el propietario. No se crearon usuarios ni se enviaron correos en esta verificación. GitHub y Vercel continúan a cargo del propietario.
