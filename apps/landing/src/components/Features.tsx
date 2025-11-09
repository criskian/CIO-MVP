const features = [
  {
    icon: '🤖',
    title: 'Asistente Inteligente',
    description:
      'CIO entiende tus preferencias y busca empleos que realmente se ajusten a tu perfil.',
  },
  {
    icon: '⚡',
    title: 'Alertas Diarias',
    description:
      'Recibe ofertas nuevas todos los días a la hora que prefieras, directamente en WhatsApp.',
  },
  {
    icon: '🎯',
    title: 'Búsqueda Personalizada',
    description:
      'Define tu cargo, ubicación, salario y tipo de jornada. CIO hace el resto por ti.',
  },
  {
    icon: '🔒',
    title: '100% Gratis y Seguro',
    description:
      'Sin costos ocultos. Tus datos están protegidos y solo se usan para mejorar tu búsqueda.',
  },
];

export default function Features() {
  return (
    <section className="py-12 md:py-20 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
          ¿Por qué usar CIO?
        </h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          Deja que la inteligencia artificial trabaje para ti mientras buscas empleo
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-gray-50 to-white p-6 rounded-xl border border-gray-200 hover:border-green-300 hover:shadow-lg transition-all duration-200"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

