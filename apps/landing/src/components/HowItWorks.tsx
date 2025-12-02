'use client';

interface HowItWorksProps {
  whatsappLink: string;
}

import Image from 'next/image';

export default function HowItWorks({ whatsappLink }: HowItWorksProps) {
  const infoCards = [
    {
      title: 'Registro fácil',
      description:
        'Chatea con CIO y cuéntanos tus datos de contacto y preferencias de búsqueda: rol, salario y ciudad.',
    },
    {
      title: 'Vacantes filtradas',
      description:
        'Nuestro agente analiza miles de ofertas y selecciona solo las que hacen match con tu perfil.',
    },
    {
      title: 'Vacantes en tu mano',
      description:
        'Recibe las oportunidades directamente en tu WhatsApp, sin portales ni mil pestañas abiertas.',
    },
    {
      title: 'Tú decides el momento',
      description:
        'Activa alertas para recibir nuevas vacantes cuando quieras: diario, cada tres días, cada semana o cada mes.',
    },
  ];

  return (
    <section className="pt-4 pb-16 md:pt-0 md:-mt-12 lg:pt-0 lg:-mt-14 xl:pt-16 xl:mt-0 md:pb-16 lg:pb-20 xl:pb-8 px-6 md:px-10 lg:px-14 xl:px-10 bg-white overflow-hidden">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          
          {/* Columna Izquierda: Celular y Textura - oculta en móvil */}
          <div className="hidden lg:flex w-full lg:w-[45%] relative justify-end items-center min-h-[600px]">
            {/* Textura de fondo - detrás del teléfono */}
            <div 
              className="absolute top-1/2 right-0 transform translate-x-[27%] -translate-y-1/2 lg:w-[700px] lg:h-[770px] xl:w-[1000px] xl:h-[1100px]"
              style={{ 
                zIndex: 1,
                maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 20%, black 35%, black 65%, transparent 80%, transparent 100%), linear-gradient(to right, transparent 0%, transparent 15%, black 30%, black 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 20%, black 35%, black 65%, transparent 80%, transparent 100%), linear-gradient(to right, transparent 0%, transparent 15%, black 30%, black 100%)',
                maskComposite: 'intersect',
                WebkitMaskComposite: 'source-in'
              }}
            >
              <Image
                src="/assets/vectors/texturaIphone15.svg"
                alt="Background Texture"
                width={994}
                height={1171}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain',
                  opacity: 0.85 
                }}
                className=""
              />
            </div>

            {/* Contenedor del celular para posicionar las burbujas relativo a él */}
            <div className="relative w-full max-w-[400px] md:max-w-[340px] lg:max-w-[380px] xl:max-w-[520px] z-20 ml-auto mr-0" style={{ transform: 'translateX(38px)' }}>
               <Image
                src="/images/iPhone 15 - HowItWorks.svg"
                alt="iPhone Mockup"
                width={500}
                height={1000}
                style={{ width: '100%', height: 'auto' }}
                priority
              />

              {/* Burbuja de chat izquierda (text-box-1) */}
              <div 
                className="absolute top-[15%] -left-[14%] md:-left-[18%] lg:-left-[18%] xl:-left-[14%] w-[70%] md:w-[55%] lg:w-[60%] xl:w-[64%] animate-float-slow"
                style={{
                  filter: 'drop-shadow(0px 4px 12px rgba(255, 255, 255, 0.8))'
                }}
              >
                <div className="bg-white border border-[#A6A6A6] rounded-2xl p-2.5 md:p-2.5 lg:p-3 xl:p-4 shadow-lg">
                  <p 
                    className="text-[#1B1B1B] font-poppins leading-relaxed md:text-[9px] lg:text-[10px] xl:text-[11px]"
                  >
                    ¡Hola! 👋 Soy CIO, tu cazador inteligente de oportunidades. 
                    <br />
                    Estoy aquí para ayudarte a encontrar las mejores ofertas laborales según tu perfil.
                    <br />
                    <br />
                    ¿Te gustaría empezar? 😊
                  </p>
                </div>
              </div>

              {/* Burbuja de chat derecha (text-box-2) */}
              <div 
                className="absolute top-[40%] md:top-[45%] lg:top-[45%] xl:top-[40%] -right-[-6%] w-[60%] md:w-[45%] lg:w-[50%] xl:w-[52%] animate-float-delayed"
                style={{
                  filter: 'drop-shadow(0px 4px 12px rgba(255, 255, 255, 0.8))'
                }}
              >
                <div className="bg-white border border-[#A6A6A6] rounded-2xl p-2.5 md:p-2.5 lg:p-3 xl:p-4 shadow-lg">
                  <p 
                    className="text-[#1B1B1B] font-poppins leading-relaxed md:text-[9px] lg:text-[10px] xl:text-[11px]"
                  >
                    Sí, busca oferta para: Analista Financiero
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Título y Cards */}
          <div className="w-full lg:w-[59%] flex flex-col justify-center items-center lg:items-start" style={{ transform: 'translateX(0px)' }}>
            <h2 className="text-2xl md:text-3xl lg:text-3xl xl:text-4xl font-bold text-[#1B1B1B] mb-8 md:mb-10 lg:mb-12 xl:mb-14 mt-0 lg:mt-[-100px] text-center font-poppins lg:transform lg:translate-x-[-20px]">
              ¿Cómo funciona?
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 md:gap-x-6 lg:gap-x-8 xl:gap-x-12 gap-y-6 md:gap-y-6 lg:gap-y-8 xl:gap-y-10 items-center w-full max-w-[500px] md:max-w-[650px] lg:max-w-none lg:transform lg:translate-x-[-20px]">
              {infoCards.map((card, index) => (
                <div
                  key={index}
                  className="bg-white border border-[#A6A6A6] rounded-3xl py-4 md:py-6 lg:py-5 xl:py-6 px-3 md:px-6 lg:px-4 xl:px-5 flex flex-col gap-3 md:gap-4 lg:gap-3 xl:gap-4 shadow-[-3px_8px_8px_0px_rgba(0,0,0,0.12),3px_8px_8px_0px_rgba(0,0,0,0.12)] transition-transform hover:-translate-y-1 duration-300 h-auto self-center"
                  style={{ transformOrigin: 'center' }}
                >
                  <h3 className="text-base md:text-lg lg:text-base xl:text-lg font-medium text-[#1B1B1B] font-poppins">
                    {card.title}
                  </h3>
                  <p className="text-xs md:text-sm lg:text-xs xl:text-sm text-[#1B1B1B] font-regular font-poppins leading-relaxed">
                    {card.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Estilos globales para animación de flotación suave si no existen */}
      <style jsx global>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .animate-float-slow {
          animation: float-slow 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 7s ease-in-out infinite 1s;
        }
      `}</style>
    </section>
  );
}
