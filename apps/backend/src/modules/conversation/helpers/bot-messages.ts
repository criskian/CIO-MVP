/**
 * Mensajes del bot CIO
 * Todos en español, tono amigable y profesional
 */

export const BotMessages = {
  // Bienvenida
  WELCOME: `¡Hola! 👋 Soy *CIO, tu Cazador Inteligente de Ofertas* by ALMIA.

Estás usando la versión Free: Estoy aquí para ayudarte a encontrar las mejores ofertas de empleo en Colombia, de forma rápida y personalizada. Conmigo podrás:

✨ Buscar empleos ajustados a tu perfil
✨ Recibir alertas diarias según tus intereses
✨ Ajustar filtros por ubicación, salario y tipo de empleo`,

  // Pregunta sobre dispositivo
  ASK_DEVICE: `Antes de comenzar, *¿desde qué dispositivo me escribes?*

📱 *Celular / Móvil*
💻 *PC / Portátil / Computador*

Esto me ayuda a mostrarte las opciones de la mejor manera.`,

  // Términos y condiciones
  ASK_TERMS: `Antes de comenzar, necesito que aceptes los términos de uso:

📋 *Términos de Uso*

• Recopilaré información básica sobre tu perfil laboral (cargo deseado, ubicación, preferencias salariales).
• Si eliges compartir tu hoja de vida, lo almacenaré de forma segura.
• Buscaré ofertas de empleo públicas.

Ver política de privacidad: https://cioalmia.vercel.app/privacy-policy

¿Aceptas estos términos? (Responde "Sí" o "No")`,

  // Rechazo de términos
  TERMS_REJECTED: `Entiendo. Si cambias de opinión, puedes escribirme de nuevo cuando quieras. ¡Éxito en tu búsqueda de empleo! 👋`,

  // Preguntas del onboarding
  ASK_ROLE: `¡Perfecto! Comencemos 🎯

¿Qué cargo o rol estás buscando?

Ejemplo: "Desarrollador Full Stack", "Contador", "Asistente Administrativo", etc.`,

  ASK_EXPERIENCE: `Genial. Ahora dime:

¿Cuántos años de experiencia tienes en este campo?

1️⃣ Sin experiencia
2️⃣ Junior (1-2 años)
3️⃣ Intermedio (3-5 años)
4️⃣ Senior (5+ años)
5️⃣ Lead/Expert (7+ años)

Responde con el número o el nombre.`,

  ASK_LOCATION: `Excelente. Ahora dime:

¿En qué ciudad vives o te encuentras actualmente?

Ejemplo: "Bogotá", "Medellín", "Cali", etc.`,

  ASK_WORK_MODE: `Perfecto. ¿Qué modalidad de trabajo prefieres?

🏠 *Remoto* - Trabajar desde casa
🏢 *Presencial* - Ir a la oficina
🔄 *Híbrido* - Mixto (remoto + presencial)
✨ *Sin preferencia* - Cualquier modalidad

Selecciona una opción.`,

  ASK_JOB_TYPE: `¿Qué tipo de jornada prefieres?

1️⃣ Tiempo completo
2️⃣ Medio tiempo
3️⃣ Pasantía
4️⃣ Freelance

Responde con el número o el nombre.`,

  ASK_MIN_SALARY: `¿Cuál es el salario mínimo que te gustaría ganar? (en pesos colombianos)

Ejemplo: "2000000", "2.5 millones", etc.

_(Puedes escribir "0" si prefieres ver todas las ofertas sin filtro de salario)_`,

  ASK_ALERT_FREQUENCY: `¡Ya casi terminamos! 🔔

¿Con qué frecuencia te gustaría recibir recordatorios de búsqueda de empleo?

1️⃣ Diariamente ☀️
2️⃣ Cada 3 días 📅
3️⃣ Semanalmente 📆
4️⃣ Mensualmente 🗓️

Responde con el número o el nombre de la opción.`,

  ASK_ALERT_TIME: `Perfecto. ⏰

¿A qué hora quieres recibir las alertas?

Ejemplo: "9:00", "18:30", "10:00 AM", etc.`,

  ASK_ALERT_TIME_MOBILE: `Perfecto. ⏰

Selecciona la hora en que quieres recibir las alertas:

_Si prefieres otra hora, escríbela (ej: "20:00", "7:30 AM")_`,

  // Confirmación y estado READY
  ONBOARDING_COMPLETE: (role: string, location: string) => `¡Listo! 🎉 Tu perfil está configurado.

🔍 Buscarás: *${role}*
📍 Ubicación: *${location}*

_Comandos disponibles:_
• Escribe *"buscar"* para encontrar ofertas de empleo ahora
• Escribe *"editar"* para cambiar alguna preferencia
• Escribe *"reiniciar"* para volver a configurar tu perfil desde cero
• Escribe *"cancelar"* si deseas dejar de usar el servicio

¿Qué te gustaría hacer?`,

  // Errores de validación
  ERROR_ROLE_INVALID: `Por favor, ingresa un cargo válido (al menos 2 caracteres).

Ejemplo: "Desarrollador", "Contador", "Asistente", etc.`,

  ERROR_EXPERIENCE_INVALID: `No entendí tu respuesta. Por favor responde con:

1️⃣ Sin experiencia
2️⃣ Junior (1-2 años)
3️⃣ Intermedio (3-5 años)
4️⃣ Senior (5+ años)
5️⃣ Lead/Expert (7+ años)`,

  ERROR_LOCATION_INVALID: `Por favor, ingresa una ciudad válida.

Ejemplo: "Bogotá", "Medellín", "Cali", etc.`,

  ERROR_WORK_MODE_INVALID: `No entendí tu respuesta. Por favor elige una opción:

🏠 *"Remoto"* - Trabajar desde casa
🏢 *"Presencial"* - Ir a la oficina
🔄 *"Híbrido"* - Mixto (remoto + presencial)
✨ *"Sin preferencia"* - Cualquier modalidad`,

  ERROR_JOB_TYPE_INVALID: `No entendí tu respuesta. Por favor responde con:

1️⃣ Tiempo completo
2️⃣ Medio tiempo
3️⃣ Pasantía
4️⃣ Freelance`,

  ERROR_SALARY_INVALID: `Por favor ingresa un salario válido en pesos colombianos (entre 500,000 y 50,000,000) o escribe "0" para no filtrar por salario.

Ejemplo: "2000000", "2.5 millones", "0"`,

  ERROR_ALERT_FREQUENCY_INVALID: `No entendí tu respuesta. Por favor responde con:

1️⃣ Diariamente ☀️
2️⃣ Cada 3 días 📅
3️⃣ Semanalmente 📆
4️⃣ Mensualmente 🗓️`,

  ERROR_TIME_INVALID: `Por favor ingresa una hora válida.

Ejemplo: "9:00", "18:30", "10:00 AM"`,

  // Mensajes de ayuda
  HELP_MESSAGE: `*¿Cómo puedo ayudarte?*

Por ahora estoy en fase de pruebas. Pronto podrás:

🔍 Escribir "buscar" para ver ofertas de empleo
📝 Enviar tu CV para personalizar las búsquedas
⚙️ Cambiar tus preferencias de búsqueda

¿Necesitas algo más?`,

  // Mensaje cuando no se entiende
  UNKNOWN_INTENT: `No entendí tu mensaje. 😅

Si necesitas ayuda, escribe "ayuda".`,

  // Mensaje cuando el usuario está en estado READY
  NOT_READY_YET: `¡Tu perfil está listo! 🎉

_Comandos disponibles:_
• Escribe *"buscar"* para encontrar ofertas de empleo ahora
• Escribe *"editar"* para cambiar alguna preferencia
• Escribe *"reiniciar"* para volver a configurar tu perfil desde cero
• Escribe *"cancelar"* si deseas dejar de usar el servicio

¿Qué te gustaría hacer?`,

  // Mensaje de error general
  ERROR_GENERAL: `Lo siento, ocurrió un error inesperado. 😔

Por favor intenta de nuevo en unos momentos.`,

  // Mensaje de retry cuando falla envío
  ERROR_RETRY: `_Hubo un problema enviando el mensaje anterior. Por favor responde directamente escribiendo tu respuesta._`,

  // Mensajes de gestión de cuenta
  CONFIRM_RESTART: `¿Estás seguro que deseas reiniciar tu perfil? 🔄

Esto eliminará toda tu configuración actual y comenzarás desde cero.

Responde *"Sí"* para confirmar o *"No"* para cancelar.`,

  RESTART_CANCELLED: `Perfecto, tu perfil se mantiene como está. 👍`,

  RESTARTED: `Tu perfil ha sido reiniciado. Comencemos de nuevo. 🔄`,

  CONFIRM_CANCEL_SERVICE: `¿Estás seguro que deseas dejar de usar CIO? 😢

Esto eliminará toda tu información y no recibirás más alertas.

Responde *"Sí"* para confirmar o *"No"* para continuar usando el servicio.`,

  SERVICE_CANCELLED: `Entiendo. Tu información ha sido eliminada y ya no recibirás alertas.

Si cambias de opinión en el futuro, puedes escribirme nuevamente.

¡Mucha suerte en tu búsqueda de empleo! 🍀`,

  CANCEL_SERVICE_ABORTED: `¡Me alegra que te quedes! 😊 Tu perfil sigue activo.`,

  // Mensajes de edición de perfil
  SHOW_CURRENT_PREFERENCES: (profile: {
    role: string;
    location: string;
    jobType: string;
    minSalary: string;
    alertFrequency: string;
    alertTime: string;
  }) => `📝 *Tus preferencias actuales:*

🔹 *Rol:* ${profile.role}
🔹 *Ubicación:* ${profile.location}
🔹 *Tipo de empleo:* ${profile.jobType}
🔹 *Salario mínimo:* ${profile.minSalary}
🔹 *Frecuencia de alertas:* ${profile.alertFrequency}
🔹 *Horario de alertas:* ${profile.alertTime}

---

Para editar una preferencia, escribe el *nombre del campo* que quieres cambiar.

*Ejemplos:*
• Escribe *"rol"* para cambiar tu cargo deseado
• Escribe *"ubicación"* para cambiar la ciudad
• Escribe *"tipo"* para cambiar el tipo de empleo
• Escribe *"salario"* para cambiar el salario mínimo
• Escribe *"frecuencia"* para cambiar la frecuencia de alertas
• Escribe *"horario"* para cambiar la hora de alertas

También puedes escribir *"cancelar"* para volver al menú principal.`,

  EDIT_FIELD_NOT_FOUND: `No entendí qué campo quieres editar. 😅

Por favor, escribe uno de estos nombres:
• *"rol"*
• *"ubicación"*
• *"tipo"*
• *"salario"*
• *"frecuencia"*
• *"horario"*

O escribe *"cancelar"* para volver.`,

  FIELD_UPDATED: (
    fieldName: string,
    newValue: string,
  ) => `✅ Perfecto! Tu *${fieldName}* ha sido actualizado a: *${newValue}*

Tu perfil está listo. Puedes:
• Escribir *"buscar"* para encontrar ofertas ahora
• Escribir *"editar"* para cambiar otra preferencia
• Escribir *"reiniciar"* para volver a configurar todo desde cero`,

  // Menú de comandos en estado READY
  MENU_READY: `¿Qué te gustaría hacer?

📋 *Comandos disponibles:*

🔍 *buscar* - Buscar ofertas de empleo ahora
✏️ *editar* - Cambiar tus preferencias
🔄 *reiniciar* - Reconfigurar tu perfil desde cero
❌ *cancelar* - Dejar de usar el servicio

Escribe el comando que desees.`,

  // Versiones DESKTOP de mensajes (sin botones/listas)
  ASK_TERMS_DESKTOP: `Antes de comenzar, necesito que aceptes los términos de uso:

📋 *Términos de Uso*

• Recopilaré información sobre tu perfil laboral (cargo deseado, ubicación, preferencias salariales).
• Si decides compartir tu CV, lo almacenaré de forma segura.
• Buscaré ofertas de empleo públicas usando Google Empleos.
• Te enviaré alertas diarias con nuevas oportunidades.
• No compartiré tu información con terceros.

Para continuar, escribe:
• *"Acepto"* o *"Sí"* para aceptar
• *"No acepto"* o *"No"* para rechazar`,

  ASK_JOB_TYPE_DESKTOP: `¿Qué tipo de jornada prefieres?

Escribe el *número* o el *nombre* de tu opción:

*1* - Tiempo completo
*2* - Medio tiempo
*3* - Pasantía
*4* - Freelance`,

  ASK_WORK_MODE_DESKTOP: `¿Qué modalidad de trabajo prefieres?

Escribe una de estas opciones:
• *"Remoto"* - Para trabajar desde casa 🏠
• *"Presencial"* - Para ir a la oficina 🏢
• *"Híbrido"* - Para trabajar mixto (remoto + presencial) 🔄
• *"Sin preferencia"* - Para cualquier modalidad ✨`,

  CONFIRM_RESTART_DESKTOP: `⚠️ ¿Estás seguro de que quieres *reiniciar tu perfil*?

Se borrarán todas tus preferencias actuales y empezaremos desde cero.

Escribe:
• *"Sí"* o *"Confirmar"* para reiniciar
• *"No"* o *"Cancelar"* para mantener tu perfil`,

  CONFIRM_CANCEL_SERVICE_DESKTOP: `⚠️ ¿Estás seguro de que quieres *cancelar el servicio*?

Se eliminará tu cuenta y toda tu información de forma permanente.

Escribe:
• *"Sí"* o *"Confirmar"* para eliminar tu cuenta
• *"No"* o *"Cancelar"* para mantener tu cuenta`,

  EDITING_PROFILE_DESKTOP: (profile: {
    role: string;
    experience: string;
    location: string;
    workMode: string;
    jobType: string;
    minSalary: string;
    alertFrequency: string;
    alertTime: string;
  }) => `📝 *Tus preferencias actuales:*

🔹 *Rol:* ${profile.role}
💡 *Experiencia:* ${profile.experience}
📍 *Ubicación:* ${profile.location}
💼 *Tipo de empleo:* ${profile.jobType}
💰 *Salario mínimo:* ${profile.minSalary}
🔔 *Frecuencia:* ${profile.alertFrequency}
⏰ *Horario de alertas:* ${profile.alertTime}

---

Escribe el *número* o *nombre* del campo que quieres editar:

*1* - *Rol* - Cambiar tu cargo deseado
*2* - *Experiencia* - Cambiar tu nivel de experiencia
*3* - *Ubicación* - Cambiar la ciudad
*4* - *Tipo* - Cambiar el tipo de empleo
*5* - *Salario* - Cambiar el salario mínimo
*6* - *Frecuencia* - Cambiar la frecuencia de alertas
*7* - *Horario* - Cambiar la hora de alertas

O escribe *"cancelar"* para volver al menú principal.`,

  // ========================================
  // NOTA: Se eliminó la opción de modalidad del menú.
  // Si se quiere restaurar, agregar después de Ubicación:
  // 🏠 *Modalidad:* ${profile.workMode}
  // Y agregar en la lista de opciones:
  // *4* - *Modalidad* - Cambiar entre remoto o presencial
  // (ajustar la numeración de las opciones siguientes)
  // ========================================
};
