const steps = [
  {
    number: '1',
    title: 'Inicia la conversación',
    description:
      'Haz clic en el botón de WhatsApp y saluda a CIO. Es rápido, fácil y sin complicaciones.',
  },
  {
    number: '2',
    title: 'Cuéntale qué buscas',
    description:
      'CIO te guiará con preguntas sobre el cargo, ubicación, salario y tipo de trabajo ideal para ti.',
  },
  {
    number: '3',
    title: 'Configura tus alertas',
    description:
      'Elige el horario perfecto para recibir nuevas oportunidades laborales cada día.',
  },
  {
    number: '4',
    title: 'Recibe ofertas personalizadas',
    description:
      'CIO buscará las mejores ofertas para ti y te las enviará directamente por WhatsApp.',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 md:py-28 px-4 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
            ¿Cómo funciona?
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            En 4 simples pasos estarás recibiendo ofertas de empleo personalizadas
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative group"
            >
              {/* Card con efecto hover */}
              <div className="relative bg-white p-8 rounded-3xl border-2 border-gray-200 hover:border-purple-300 transition-all duration-300 hover:shadow-xl h-full">
                {/* Número grande de fondo */}
                <div className="absolute top-4 right-4 text-8xl font-bold text-gray-100 group-hover:text-purple-100 transition-colors">
                  {step.number}
                </div>

                {/* Badge con número */}
                <div className="relative mb-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl shadow-lg">
                    <span className="text-2xl font-bold text-white">{step.number}</span>
                  </div>
                </div>

                {/* Contenido */}
                <div className="relative">
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed text-lg">{step.description}</p>
                </div>

                {/* Indicador de progreso (línea conectora) - solo visible en desktop */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-5 w-10 h-0.5 bg-gradient-to-r from-purple-300 to-transparent"></div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CTA adicional */}
        <div className="mt-16 text-center">
          <p className="text-gray-600 text-lg">
            ¿Todo listo?{' '}
            <a href="#hero" className="text-purple-600 hover:text-purple-700 font-semibold underline decoration-2 underline-offset-4 transition-colors">
              Comienza ahora mismo
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
