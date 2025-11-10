const features = [
  {
    title: 'Asistente Inteligente',
    description:
      'CIO entiende tus preferencias y busca empleos que realmente se ajusten a tu perfil profesional.',
    gradient: 'from-purple-500 to-purple-600',
  },
  {
    title: 'Alertas Diarias',
    description:
      'Recibe ofertas nuevas todos los días a la hora que prefieras, directamente en tu WhatsApp.',
    gradient: 'from-indigo-500 to-indigo-600',
  },
  {
    title: 'Búsqueda Personalizada',
    description:
      'Define tu cargo ideal, ubicación, salario y tipo de jornada. CIO hace el resto por ti.',
    gradient: 'from-violet-500 to-violet-600',
  },
  {
    title: '100% Gratis y Seguro',
    description:
      'Sin costos ocultos. Tus datos están protegidos y solo se usan para mejorar tu experiencia.',
    gradient: 'from-purple-600 to-indigo-600',
  },
];

export default function Features() {
  return (
    <section className="py-20 md:py-28 px-4 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
            ¿Por qué usar CIO?
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            Deja que la inteligencia artificial trabaje para ti mientras buscas empleo
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative bg-white p-8 rounded-3xl border border-gray-200 hover:border-transparent hover:shadow-2xl transition-all duration-300 hover:-translate-y-2"
            >
              {/* Gradiente de fondo al hacer hover */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 rounded-3xl transition-opacity duration-300`}
              ></div>

              {/* Barra decorativa */}
              <div
                className={`w-12 h-1 bg-gradient-to-r ${feature.gradient} rounded-full mb-6`}
              ></div>

              {/* Contenido */}
              <h3 className="text-xl font-bold text-gray-900 mb-3 relative">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed relative">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
