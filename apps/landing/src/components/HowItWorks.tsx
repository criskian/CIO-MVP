const steps = [
  {
    number: '1',
    title: 'Inicia la conversación',
    description: 'Haz clic en el botón de WhatsApp y saluda a CIO. Es rápido y sencillo.',
    icon: '💬',
  },
  {
    number: '2',
    title: 'Cuéntale qué buscas',
    description:
      'CIO te hará preguntas sobre el cargo, ubicación, salario y tipo de trabajo que deseas.',
    icon: '📝',
  },
  {
    number: '3',
    title: 'Configura tus alertas',
    description: 'Elige a qué hora quieres recibir nuevas oportunidades cada día.',
    icon: '⏰',
  },
  {
    number: '4',
    title: 'Recibe ofertas personalizadas',
    description:
      'CIO buscará las mejores ofertas para ti y te las enviará directamente por WhatsApp.',
    icon: '🎁',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-12 md:py-20 px-4 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
          ¿Cómo funciona?
        </h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          En solo 4 pasos estarás recibiendo ofertas de empleo personalizadas
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative bg-white p-6 md:p-8 rounded-xl shadow-md hover:shadow-xl transition-shadow duration-200"
            >
              {/* Número del paso */}
              <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                {step.number}
              </div>

              {/* Ícono */}
              <div className="text-5xl mb-4 mt-2">{step.icon}</div>

              {/* Contenido */}
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-gray-600 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

