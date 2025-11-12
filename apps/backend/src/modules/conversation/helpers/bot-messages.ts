/**
 * Mensajes del bot CIO
 * Todos en español, tono amigable y profesional
 */

export const BotMessages = {
  // Bienvenida
  WELCOME: `¡Hola! 👋 Soy CIO, tu Cazador Inteligente de Oportunidades.

Estoy aquí para ayudarte a encontrar las mejores ofertas de empleo en Colombia.

✨ Por ahora estoy en fase de pruebas, pero pronto podré:
• Buscar empleos personalizados para ti
• Enviarte alertas diarias
• Filtrar por ubicación, salario y tipo de trabajo

¡Gracias por probarme! 🚀`,

  // Términos y condiciones
  ASK_TERMS: `Antes de comenzar, necesito que aceptes los términos de uso:

📋 *Términos de Uso*

• Recopilaré información sobre tu perfil laboral (cargo deseado, ubicación, preferencias salariales).
• Si decides compartir tu CV, lo almacenaré de forma segura.
• Buscaré ofertas de empleo públicas usando Google Empleos.
• Te enviaré alertas diarias con nuevas oportunidades.
• No compartiré tu información con terceros.

¿Aceptas estos términos? (Responde "Sí" o "No")`,

  // Rechazo de términos
  TERMS_REJECTED: `Entiendo. Si cambias de opinión, puedes escribirme de nuevo cuando quieras. ¡Éxito en tu búsqueda de empleo! 👋`,

  // Preguntas del onboarding
  ASK_ROLE: `¡Perfecto! Comencemos 🎯

¿Qué cargo o rol estás buscando?

Ejemplo: "Desarrollador Full Stack", "Contador", "Asistente Administrativo", etc.`,

  ASK_LOCATION: `Excelente. Ahora dime:

¿En qué ciudad quieres trabajar? (o escribe "Remoto" si prefieres trabajo desde casa)`,

  ASK_JOB_TYPE: `¿Qué tipo de jornada prefieres?

1️⃣ Tiempo completo
2️⃣ Medio tiempo
3️⃣ Pasantía
4️⃣ Freelance

Responde con el número o el nombre.`,

  ASK_MIN_SALARY: `¿Cuál es el salario mínimo que te gustaría ganar? (en pesos colombianos)

Ejemplo: "2000000", "2.5 millones", etc.

_(Puedes escribir "0" si prefieres ver todas las ofertas sin filtro de salario)_`,

  ASK_ALERT_TIME: `¡Ya casi terminamos! ⏰

¿A qué hora quieres recibir alertas diarias con nuevas ofertas?

Ejemplo: "9:00", "18:30", "10:00 AM", etc.`,

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

  ERROR_LOCATION_INVALID: `Por favor, ingresa una ciudad válida o escribe "Remoto".

Ejemplo: "Bogotá", "Medellín", "Remoto", etc.`,

  ERROR_JOB_TYPE_INVALID: `No entendí tu respuesta. Por favor responde con:

1️⃣ Tiempo completo
2️⃣ Medio tiempo
3️⃣ Pasantía
4️⃣ Freelance`,

  ERROR_SALARY_INVALID: `Por favor ingresa un salario válido en pesos colombianos (entre 500,000 y 50,000,000) o escribe "0" para no filtrar por salario.

Ejemplo: "2000000", "2.5 millones", "0"`,

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
    alertTime: string;
  }) => `📝 *Tus preferencias actuales:*

🔹 *Rol:* ${profile.role}
🔹 *Ubicación:* ${profile.location}
🔹 *Tipo de empleo:* ${profile.jobType}
🔹 *Salario mínimo:* ${profile.minSalary}
🔹 *Horario de alertas:* ${profile.alertTime}

---

Para editar una preferencia, escribe el *nombre del campo* que quieres cambiar.

*Ejemplos:*
• Escribe *"rol"* para cambiar tu cargo deseado
• Escribe *"ubicación"* para cambiar la ciudad
• Escribe *"tipo"* para cambiar el tipo de empleo
• Escribe *"salario"* para cambiar el salario mínimo
• Escribe *"horario"* para cambiar la hora de alertas

También puedes escribir *"cancelar"* para volver al menú principal.`,

  EDIT_FIELD_NOT_FOUND: `No entendí qué campo quieres editar. 😅

Por favor, escribe uno de estos nombres:
• *"rol"*
• *"ubicación"*
• *"tipo"*
• *"salario"*
• *"horario"*

O escribe *"cancelar"* para volver.`,

  FIELD_UPDATED: (fieldName: string, newValue: string) => `✅ Perfecto! Tu *${fieldName}* ha sido actualizado a: *${newValue}*

Tu perfil está listo. Puedes:
• Escribir *"buscar"* para encontrar ofertas ahora
• Escribir *"editar"* para cambiar otra preferencia
• Escribir *"reiniciar"* para volver a configurar todo desde cero`,
};
