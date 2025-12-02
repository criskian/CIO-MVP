'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface BenefitsProps {
  whatsappLink: string;
}

export default function Benefits({ whatsappLink }: BenefitsProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);
  return (
    <section className="-mt-6 md:-mt-0 lg:-mt-[240px] pb-32 lg:pb-0 px-6 md:px-4 bg-white overflow-hidden">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
          
          {/* Columna Izquierda: Imagen de personas - oculta en móvil */}
          <div className="hidden lg:flex w-full lg:w-1/2 justify-center lg:justify-start">
            <div
              className="relative w-full max-w-[640px]"
              style={{ transform: 'scaleX(-1) translateY(100px)' }}
            >
              <Image
                src="/images/personas-mockup.png"
                alt="Personas usando CIO"
                width={600}
                height={700}
                className="w-full h-auto object-contain"
                priority
              />
            </div>
          </div>

          {/* Columna Derecha: Contenido */}
          <div className="w-full lg:w-1/2 flex flex-col gap-6 mt-10 lg:mt-[60px] lg:scale-[0.9] lg:origin-top-left items-center lg:items-start">
            
            {/* Cuadro morado con overlay/borde */}
            <div className="relative w-[85%] max-w-[500px] lg:max-w-none lg:ml-[-210px]" style={isDesktop ? { width: 'calc(100% + 215px)' } : {}}>
              {/* Marco exterior - versión móvil */}
              <div className="lg:hidden absolute rounded-[16px] border-[1px] border-[#9054C6] border-solid" style={{ top: '-12px', bottom: '-12px', left: '-12px', right: '-12px' }} />
              {/* Marco exterior - versión desktop */}
              <div className="hidden lg:block absolute rounded-[20px] border-[1px] border-[#9054C6] border-solid" style={{ top: '-18px', bottom: '-18px', left: '-18px', right: '-18px' }} />
              
              {/* Cuadro morado interior */}
              <div 
                className="relative bg-[#9054C6] rounded-[20px] px-5 py-6 md:px-7 md:py-4 lg:px-8 xl:px-9"
                style={{
                  zIndex: 2,
                }}
              >
                <p 
                  className="text-[#F8F8F8] font-poppins text-center leading-relaxed text-[15px] md:text-[19px] lg:text-[20px] xl:text-[23px] font-normal"
                >
                  Encontrar trabajo no es suerte, es estrategia.
                  <br />
                  CIO detecta las oportunidades; Almia te prepara para ser el mejor candidato.
                </p>
              </div>
            </div>

            {/* Sección de Beneficios */}
            <div className="mt-1 md:mt-3 text-center lg:text-left lg:ml-[-90px]" style={{ transform: isDesktop ? 'translateY(70px)' : 'translateY(40px)' }}>
              {/* Título */}
              <h2 
                className="font-poppins font-bold text-[#2C2C2C] mb-2 md:mb-3 text-[26px] md:text-[34px] xl:text-[40px] leading-[1]"
                style={{ textShadow: '0px 2px 6px rgba(0, 0, 0, 0.28)' }}
              >
                Pruébalo ya
              </h2>

              {/* Texto con enlace */}
              <p 
                className="font-poppins text-[#2C2C2C] text-[14px] md:text-[16px] xl:text-[18px] leading-relaxed font-normal mb-8 md:mb-[80px]"
                style={{ textShadow: '0px 2px 4px rgba(0, 0, 0, 0.18)' }}
              >
                ¿Qué esperas para encontrar tu nueva oportunidad laboral? Empieza tu busqueda.
              </p>

              {/* Botón de WhatsApp para probar CIO*/}
              <div className="w-full flex justify-center">
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-3 px-10 py-4 bg-[#25D366] text-white font-medium rounded-lg text-lg md:text-xl hover:bg-white hover:text-[#25D366] border-2 border-[#25D366] transition-all duration-300"
                >
                  <svg className="w-6 h-6 md:w-7 md:h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                  <span>Comienza ya</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

