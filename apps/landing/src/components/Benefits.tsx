'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import RegistrationModal from './RegistrationModal';

interface BenefitsProps {
  whatsappLink: string;
}

export default function Benefits({ whatsappLink }: BenefitsProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

              {/* Botón */}
              <div className="w-full flex flex-col gap-3 items-center lg:items-start">
                {/* Botón principal - Empieza Ahora */}
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="font-poppins inline-flex items-center justify-center gap-3 px-12 md:px-16 lg:px-20 py-2.5 md:py-3 bg-[#9054C6] text-white font-normal rounded-lg border-2 border-[#9054C6] hover:bg-white hover:text-[#9054C6] transition-all duration-300 shadow-lg"
                >
                  <span>Empieza Ahora</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Registro */}
      <RegistrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
}

