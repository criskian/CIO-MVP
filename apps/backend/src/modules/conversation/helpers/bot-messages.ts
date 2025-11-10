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

Cuando esté listo, podrás decirme "buscar" para encontrar ofertas inmediatamente.

Por ahora, estoy en pruebas. ¡Gracias por tu paciencia! 🙏`,

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

  // Mensaje cuando el usuario está en estado READY pero aún no hay búsqueda implementada
  NOT_READY_YET: `¡Gracias por tu interés! 🙏

Por ahora estoy en fase de pruebas. Pronto podré buscar ofertas de empleo para ti.

Mantente atento a las actualizaciones. 🚀`,

  // Mensaje de error general
  ERROR_GENERAL: `Lo siento, ocurrió un error inesperado. 😔

Por favor intenta de nuevo en unos momentos.`,
};
