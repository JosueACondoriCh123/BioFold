# BioFold 3D — contexto maestro

Última actualización: 2 de septiembre de 2026. Este archivo describe el estado verificable del repositorio. El documento Word de la hackathon es contexto de producto, no autoridad técnica.

## 1. Objetivo y alcance

BioFold 3D es una SPA científica donde una persona y agentes WebMCP exploran la misma escena molecular. Toda afirmación debe distinguir evidencia `observed`, `calculated`, `heuristic` o `unavailable`.

No entran docking, ΔΔG, dinámica molecular, predicción de estabilidad, diagnóstico o patogenicidad clínica ni modificación real de coordenadas.

## 2. Estado Git y coordinación

- Rama de integración local: `codex/phase2-3-mvp`.
- Base de 2.3: `b71afa5` (`codex/phase2-assistant-core`).
- Se integraron dos entregas externas separadas: Assistant/UI y DB/Edge. La integración corrigió sus contratos antes del QA final.
- No se hizo push, deploy ni mutación del Supabase/Vercel remoto.
- El propietario conserva el control de GitHub, Supabase Branching, secretos, Vercel y producción.
- `.env.local` y secretos locales siguen ignorados. Nunca copiar `service_role`, `sb_secret_*`, Google u OpenRouter a variables `VITE_*`.

La migración 2.2 contenía un operador pgvector sin calificar que impedía recrear una base vacía con `search_path=''`. Se aplicó la corrección mecánica `OPERATOR(extensions.<=>)` en `20260901225652_phase2_assistant_rag.sql`; no cambia tablas ni datos. Todo el esquema funcional 2.3 está en la migración nueva `20260902233000_phase2_3_db_controls.sql`.

## 3. Arquitectura 2.3

```text
React/Vite UI
  ├─ Supabase Auth: email, Google PKCE, confirmación y recuperación
  ├─ ProjectDataPort: proyectos privados + snapshots + audit trail
  ├─ Command Bus: ocho comandos compartidos por UI/WebMCP
  └─ AssistantClient: SSE tipado
       └─ biofold-chat
            ├─ sesión y ownership explícitos
            ├─ claim/finalize atómicos por service_role
            ├─ conversaciones y mensajes persistentes
            ├─ RAG pgvector 384D + full-text
            ├─ caché independiente RCSB/UniProt + telemetría
            └─ OpenRouter openai/gpt-5-mini, JSON Schema y streaming real

biofold-ingest-knowledge
  └─ bearer BIOFOLD_INGEST_TOKEN → gte-small → reemplazo transaccional por fuente
```

3Dmol, workers, AbortSignals, sesiones y secretos no se guardan en Zustand ni en `WorkspaceSnapshotV1`. La landing sigue cargando el laboratorio de forma diferida.

## 4. Contratos invariables

Los ocho comandos siguen siendo:

1. `load_structure`
2. `get_structure_summary`
3. `focus_residues`
4. `set_representation`
5. `show_surface`
6. `measure_distance`
7. `preview_mutation_context`
8. `reset_workspace`

`COMMAND_NAMES`, `parseCommandInput`, `CommandResult` y `WorkspaceSnapshotV1` no cambiaron. Las propuestas permanecen inertes hasta pulsar **Apply** y el audit trail exige `approvedByUser: true`.

## 5. Assistant 2.3 implementado

- Modelo fijo `openai/gpt-5-mini`, `stream:true`, `response_format.json_schema.strict:true`, `provider.require_parameters:true` y máximo 1.200 tokens de salida; no se envía `temperature`.
- El parser SSE tolera fragmentación de bytes, CRLF dividido, heartbeats, errores, `[DONE]`, usage opcional e ID del proveedor.
- Un tokenizer incremental emite sólo caracteres decodificados de la propiedad raíz `answer`, incluidos escapes y pares sustitutos Unicode.
- El documento JSON completo y las propuestas se validan contra los ocho contratos antes de persistir o emitir citas/propuestas.
- Orden público: `meta` → `delta*` → persistencia validada → `citations` → `proposals` → `usage` opcional → `done`.
- Un parcial cancelado o fallido queda sólo en UI como `Interrupted / unverified`; no se persiste y no conserva propuestas. Retry reutiliza el prompt exacto con un UUID nuevo.
- Los replays completados son streams sintéticos inmediatos. IDs activos, fallidos, cancelados o expirados devuelven conflicto.
- `BUDGET_EXCEEDED` informa únicamente que el límite gratuito diario se reinicia a las 00:00 UTC; no existe pago, upgrade ni cuota por proyecto.

## 6. Consumo, seguridad y RLS

- `claim_assistant_request` y `finalize_assistant_request` son `SECURITY INVOKER`, `search_path=''` y ejecutables sólo por `service_role`.
- El claim usa advisory lock por usuario, comprueba owner de proyecto/conversación, expira reservas a los cinco minutos y admite exactamente seis solicitudes nuevas por ventana móvil de 60 segundos.
- La cuota es USD 1 por usuario y día UTC. Cada claim reserva USD 0,05.
- Si el proveedor no fue llamado se libera la reserva; si fue llamado pero falta usage se cobra USD 0,05; un costo real mayor se conserva y bloquea claims posteriores.
- La conversación y la pregunta se crean dentro del claim sólo después de la admisión. El primer título usa hasta 80 caracteres.
- La finalización válida inserta la respuesta y reconcilia consumo en una transacción.
- El navegador tiene CRUD sólo sobre conversaciones propias y lectura de mensajes propios. No puede escribir mensajes ni leer `ai_requests`, corpus, ingestión, caché o métricas.
- Borrar una conversación elimina mensajes por cascada, conserva `ai_requests` con `conversation_id = null` y no borra el audit trail del proyecto.

## 7. Conversaciones

`AssistantConversationPort` expone `list`, `load`, `rename` y `delete`.

- Lista como máximo 50 conversaciones por `updated_at DESC`.
- Carga los últimos 100 mensajes en descendente y los invierte en memoria.
- **New** abre un borrador local; no crea filas vacías.
- Rename normaliza títulos de 1–120 caracteres.
- Delete requiere confirmación y selecciona la conversación restante más reciente o un borrador vacío.
- Switch/New/Rename/Delete quedan bloqueados durante streaming hasta Stop.
- AbortController más una generación impiden que cargas antiguas sobrescriban la selección vigente.
- El estado Applied se restaura por `sourceMessageId`, comando, confirmación y resultado exitoso.

## 8. Corpus, caché y evaluación

- `knowledge/manifest.json` schema v2 fija normalización NFC/LF, chunking por encabezado/párrafo, límites 1.200 caracteres/180 palabras, `gte-small`, 384 dimensiones y checksums.
- `knowledge:build` regenera payload y seed; `knowledge:check` compara sin escribir; `knowledge:ingest` llama al endpoint administrativo.
- La ingestión es POST-only, sin CORS y con bearer `BIOFOLD_INGEST_TOKEN`. Verifica hashes, vectores normalizados 384D y reemplaza cada fuente transaccionalmente.
- Una fuente idéntica con embeddings completos queda `skipped`.
- La búsqueda semántica descarta distancia coseno mayor a 0,35; full-text sigue disponible sin embedding o vecino aceptable.
- RCSB y UniProt usan entradas separadas por proveedor/clave: éxito fresco siete días, stale hasta treinta, 404 una hora y revalidación ETag/Last-Modified.
- La telemetría server-only registra `hit`, `miss`, `revalidated`, `stale_fallback` o `unavailable`, HTTP status y latencia.
- `evals/assistant/golden.json` contiene 16 casos: ocho de evidencia, cuatro de 1CRN/4HHB/fuentes y cuatro abstenciones obligatorias.
- El runner usa conversación y UUID nuevos, espacia todas las solicitudes al menos 10,5 s y permite una sola repetición transitoria. Gates: citas 100%, recall ≥90%, abstención 100%, propuestas válidas 100%, autoejecución 0, TTFT p95 <8 s y total p95 <30 s.

## 9. Configuración server-only

```text
OPENROUTER_API_KEY
OPENROUTER_SITE_URL
BIOFOLD_ALLOWED_ORIGINS
BIOFOLD_USER_DAILY_BUDGET_USD=1.00
BIOFOLD_REQUEST_RESERVE_USD=0.05
BIOFOLD_INGEST_TOKEN
SUPABASE_PUBLISHABLE_KEY
```

El runtime provee `SUPABASE_URL` y `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. El modelo no es configurable. Frontend sólo usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.

## 10. Evidencia local de QA

- ESLint: 0 errores; la advertencia de dependencias de hook detectada durante integración fue corregida.
- TypeScript estricto: aprobado.
- Vitest: **323/323**, 40 archivos.
- Build de producción: aprobado.
- Playwright: **53/53**, 0 fallos.
- Supabase CLI 2.116.0 + Docker 29.4.3: `db reset` aprobado desde base vacía.
- pgTAP: **43/43**.
- Carrera real de siete conexiones: **6 admitidas, 1 rate-limited**.
- `supabase db lint --local --schema public --level warning --fail-on warning`: sin hallazgos.
- Ambas Edge Functions compilan y arrancan en `supabase-edge-runtime` compatible con Deno 2.1.4.
- Ingestión local real: 6 chunks, todos 384D; segunda corrida idéntica: ambas fuentes `skipped`.
- `knowledge:check`: reproducible.

Warnings conocidos: 3Dmol contiene `eval`; el chunk lazy del laboratorio supera 500 kB. La primera inferencia local del corpus activó el soft limit del isolate después de responder correctamente; staging debe confirmar el margen del entorno hospedado.

## 11. Gates remotos pendientes

Requieren autorización y credenciales del propietario:

1. Crear la rama Supabase `phase2-3-mvp`, aplicar migraciones, secretos y funciones.
2. Ejecutar Security Advisor y Performance Advisor hospedados y corregir hallazgos críticos.
3. Ingerir el corpus y ejecutar `eval:assistant` con crédito OpenRouter.
4. Conectar un preview Vercel, SMTP, Google OAuth, redirects y orígenes exactos.
5. Ejecutar aislamiento con dos usuarios reales y el recorrido proyecto → Assistant → citas → Apply → reload → cambio de conversación.
6. Tras aprobación explícita: backup lógico/restorable, `db push --dry-run`, producción sin seed, funciones, corpus, frontend y smoke de Auth/Assistant/ocho herramientas.
7. Sólo después de todos los gates: actualizar resultados públicos, demo/submission y crear la etiqueta `v0.1.0-mvp`.

Rollback previsto: deployment anterior de Vercel y Edge Functions. La migración 2.3 no elimina columnas existentes; restaurar la base sólo ante corrupción o fallo no recuperable.
