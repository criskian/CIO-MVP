'use client';

import { useState } from 'react';

const testimonials = [
    {
        id: 1,
        name: 'Juan David',
        text: 'En general la experiencia ha sido positiva. El sistema genera información de vacantes de forma diaria y es útil para tener visibilidad del mercado.',
        gradient: 'from-[#9054C6] to-[#73439E]',
    },
    {
        id: 2,
        name: 'Alberto',
        text: 'Con CIO, fue mas rápido el proceso de encontrar empleo, me llegaron vacantes diarias directo a mi WhatsApp y muy actualizadas',
        gradient: 'from-[#3BC8B8] to-[#2FA093]',
    },
    {
        id: 3,
        name: 'Lucía',
        text: 'Fácil de usar y de mucho valor para cuando uno está buscando empleo',
        gradient: 'from-[#FFE11E] to-[#FFC700]',
    },
];

export default function Testimonials() {
    const [hoveredCard, setHoveredCard] = useState<number | null>(null);

    return (
        <section className="w-full py-2 md:py-4 bg-white relative overflow-hidden">
            <div className="max-w-6xl mx-auto px-4 md:px-8 relative z-10">

                {/* Grid de testimonios */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                    {testimonials.map((testimonial) => (
                        <div
                            key={testimonial.id}
                            className="group relative"
                            onMouseEnter={() => setHoveredCard(testimonial.id)}
                            onMouseLeave={() => setHoveredCard(null)}
                        >
                            {/* Card principal con glassmorphism */}
                            <div
                                className={`
                  relative h-full rounded-xl p-5
                  bg-purple-100 backdrop-blur-sm
                  border-2 border-gray-100
                  transition-all duration-300 ease-out
                  ${hoveredCard === testimonial.id
                                        ? 'transform -translate-y-2'
                                        : ''
                                    }
                `}
                            >
                                {/* Barra de color en la parte superior */}
                                <div
                                    className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl bg-gradient-to-r ${testimonial.gradient}`}
                                />

                                {/* Icono de comillas */}
                                <div className="mb-3">
                                    <svg
                                        className={`w-8 h-8 transition-all duration-300 ${hoveredCard === testimonial.id ? 'opacity-100 scale-110' : 'opacity-60'
                                            }`}
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <defs>
                                            <linearGradient id={`gradient-${testimonial.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor={testimonial.gradient.includes('9054C6') ? '#9054C6' : testimonial.gradient.includes('3BC8B8') ? '#3BC8B8' : '#FFE11E'} />
                                                <stop offset="100%" stopColor={testimonial.gradient.includes('73439E') ? '#73439E' : testimonial.gradient.includes('2FA093') ? '#2FA093' : '#FFC700'} />
                                            </linearGradient>
                                        </defs>
                                        <path
                                            fill={`url(#gradient-${testimonial.id})`}
                                            d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"
                                        />
                                    </svg>
                                </div>

                                {/* Texto del testimonio */}
                                <p className="text-[#646363] text-sm md:text-base leading-relaxed mb-4">
                                    "{testimonial.text}"
                                </p>

                                {/* Información del usuario */}
                                <div className="flex items-center gap-3">
                                    {/* Avatar con gradiente */}
                                    <div
                                        className={`
                      w-10 h-10 rounded-full 
                      bg-gradient-to-br ${testimonial.gradient}
                      flex items-center justify-center
                      text-white font-bold text-base
                      shadow-md
                    `}
                                    >
                                        {testimonial.name.charAt(0)}
                                    </div>

                                    {/* Nombre */}
                                    <div>
                                        <h4 className="font-semibold text-[#646363] text-sm md:text-base">
                                            {testimonial.name}
                                        </h4>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
