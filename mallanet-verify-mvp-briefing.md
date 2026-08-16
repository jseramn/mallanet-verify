# Briefing de Producto — Mayanet Verify MCP

## 1. Resumen ejecutivo

**Nombre del producto:** Mayanet Verify  
**Tipo:** MCP Server (Model Context Protocol)  
**Objetivo:** Verificar la confiabilidad e integridad de voluntarios de una ONG de respuesta a desastres, cruzando datos oficiales de Colombia (vía Croma) con la información declarada en el formulario de registro y perfiles públicos (LinkedIn).

El sistema se conecta a la base de datos de voluntarios en Neon, permite solicitar o recibir cédula + LinkedIn URL, consulta fuentes oficiales mediante Croma, valida coherencia de datos y genera un reporte estructurado con estados **Pass / Alert / Fail**.

---

## 2. Contexto del problema

Mayanet es una ONG enfocada en respuesta a desastres naturales y organización digital de voluntarios de la sociedad civil. Actualmente existen más de 900 registros de voluntarios en un formulario. El sistema no capturó cédulas de forma completa porque la infraestructura no estaba preparada al momento de la emergencia.

**Problema actual:**
- No se puede validar legalmente la identidad e integridad de los voluntarios inscritos.
- No existe un flujo automatizado de verificación contra registros públicos de Colombia.
- El cruce entre lo que la persona declaró (experiencia, profesión, empresa) y lo que aparece en fuentes oficiales / LinkedIn es manual e imposible a escala.

**Necesidad:**
Un sistema automatizado que permita:
1. Leer los registros existentes desde Neon.
2. Solicitar o capturar cédula + LinkedIn.
3. Consultar fuentes oficiales de Colombia.
4. Validar coherencia de información.
5. Generar un reporte de confiabilidad listo para decisión operativa.

---

## 3. Alcance del MVP

### Qué incluye el MVP
- Un **MCP Server** único que expone tools para:
  - Conectarse a la base de datos de Neon y leer voluntarios.
  - Recibir o asociar cédula colombiana + URL de LinkedIn a un registro.
  - Consultar Croma (Rama Judicial, Policía Nacional / antecedentes, Procuraduría, RUES cuando aplique).
  - Extraer / validar información básica de LinkedIn (experiencia, educación, cargo).
  - Generar un reporte de verificación estructurado (Pass / Alert / Fail por categoría).

### Qué no incluye el MVP
- Interfaz gráfica completa (el foco es el MCP Server + tools).
- Flujos de notificaciones masivas por WhatsApp/email (se pueden agregar después).
- Scoring numérico complejo (se usa Pass / Alert / Fail).
- Verificación biométrica o facial.

---

## 4. Arquitectura de alto nivel

```
[Agente / Cliente MCP]
        │
        ▼
[Mayanet Verify MCP Server]
        │
        ├──► Neon MCP / Neon Postgres  (lectura de voluntarios)
        ├──► Croma API / Croma MCP     (datos oficiales Colombia)
        └──► LinkedIn (OAuth o extracción pública de perfil)
```

El servidor debe poder:
- Usar el MCP oficial de Neon para consultas a la base de datos, **o** conectarse directamente vía connection string.
- Usar Croma preferiblemente vía su servidor MCP (si está disponible) o mediante llamadas directas a la API.
- Exponer un conjunto de **tools** claras y bien documentadas para que cualquier agente pueda orquestar el flujo.

---

## 5. Tools mínimas que debe exponer el MCP

| Tool | Descripción | Inputs principales | Output |
|------|-------------|---------------------|--------|
| `list_pending_volunteers` | Lista voluntarios de Neon que aún no tienen verificación completa | `limit`, `status_filter` | Lista de registros |
| `get_volunteer` | Obtiene un voluntario por ID | `volunteer_id` | Datos del registro |
| `request_verification_data` | Genera / registra la solicitud de cédula + LinkedIn | `volunteer_id` | Estado de solicitud |
| `verify_volunteer` | Ejecuta la verificación completa | `volunteer_id` **o** `cedula` + `linkedin_url` | Reporte completo |
| `check_croma_background` | Consulta solo Croma (Rama Judicial, antecedentes, etc.) | `cedula` o `name` | Resultados por fuente |
| `validate_linkedin` | Extrae y resume perfil de LinkedIn | `linkedin_url` | Datos estructurados |
| `generate_report` | Genera el reporte final Pass/Alert/Fail | `volunteer_id` o datos crudos | JSON + texto legible |

---

## 6. Fuentes de datos y documentación (el agente debe investigarlas)

### Neon
- Repositorio oficial del MCP Server:  
  https://github.com/neondatabase/mcp-server-neon
- Documentación:  
  https://neon.com/docs/ai/neon-mcp-server
- Endpoint remoto: `https://mcp.neon.tech/mcp`

### Croma (datos gubernamentales de Colombia)
- Documentación principal:  
  https://docs.usecroma.com
- Introducción (incluye mención a servidor MCP):  
  https://docs.usecroma.com/es/introduction
- Quickstart:  
  https://docs.usecroma.com/quickstart
- MCP Server de Croma:  
  https://docs.usecroma.com/mcp-server
- Fuentes clave para verificación de personas:
  - Rama Judicial (procesos por entidad / nombre)
  - Policía Nacional (antecedentes / criminal records)
  - Procuraduría (registros disciplinarios)
  - RUES (registro empresarial)
- Índice completo de endpoints:  
  https://docs.usecroma.com/llms.txt

### LinkedIn
- Preferir OAuth cuando sea posible.
- Como fallback del MVP: extracción pública del perfil (experiencia, educación, headline) a partir de la URL.

---

## 7. Formato de reporte esperado

Para cada voluntario el sistema debe devolver algo equivalente a:

```json
{
  "volunteer_id": "...",
  "name": "...",
  "cedula": "...",
  "overall_status": "Pass | Alert | Fail",
  "checks": {
    "judicial": "Pass | Alert | Fail",
    "criminal_records": "Pass | Alert | Fail",
    "procuraduria": "Pass | Alert | Fail",
    "rues": "Pass | Alert | Fail | N/A",
    "linkedin_consistency": "Pass | Alert | Fail"
  },
  "findings": [
    "Resumen de hallazgos relevantes"
  ],
  "linkedin_summary": {
    "headline": "...",
    "experience": [...],
    "education": [...]
  },
  "timestamp": "..."
}
```

---

## 8. Principios de diseño para el MVP

1. **Croma debe ser central** en el flujo de verificación.
2. El MCP debe ser usable por cualquier cliente compatible (Claude, Cursor, etc.).
3. Preferir composición de tools pequeñas y claras sobre un solo tool monolítico.
4. Manejo de errores graceful (si una fuente de Croma falla, el resto del reporte sigue).
5. Todo debe ser open-source y con licencia MIT (alineado con la filosofía de Mayanet).
6. El agente debe poder leer la documentación de Neon y Croma para implementar las integraciones correctamente.

---

## 9. Criterios de éxito del MVP

- [ ] El MCP se conecta a Neon y lista voluntarios pendientes.
- [ ] Se puede asociar cédula + LinkedIn a un registro.
- [ ] Se realizan llamadas reales a Croma y se obtienen resultados.
- [ ] Se genera un reporte Pass/Alert/Fail legible.
- [ ] El servidor puede ser consumido por un cliente MCP estándar.
- [ ] Documentación mínima de las tools expuestas.

---

## 10. Instrucciones para el agente (SDD)

1. Investiga las fuentes listadas en la sección 6.
2. Diseña la estructura del MCP Server (tools, schemas de input/output).
3. Implementa primero la integración con Neon (lectura de voluntarios).
4. Implementa las llamadas a Croma (priorizar Rama Judicial + Policía Nacional + Procuraduría).
5. Agrega validación básica de LinkedIn.
6. Une todo en el tool `verify_volunteer`.
7. Genera el reporte final.
8. Documenta cómo levantar y consumir el servidor.

---

**Fin del briefing.**
