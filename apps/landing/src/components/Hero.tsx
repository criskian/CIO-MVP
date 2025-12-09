'use client';

import { useState } from 'react';
import Image from 'next/image';
import RegistrationModal from './RegistrationModal';

interface HeroProps {
  whatsappLink: string;
}

export default function Hero({ whatsappLink }: HeroProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section className="w-full h-auto min-h-[800px] md:min-h-[700px] lg:min-h-[800px] xl:h-screen xl:min-h-[920px] xl:max-h-[1100px] flex flex-col bg-white relative overflow-hidden">
      {/* Logo Almia en la parte superior */}
      <div className="w-full pt-12 md:pt-4 md:pb-2 lg:pt-8 lg:pb-4 xl:pt-14 xl:pb-0 xl:mb-0 relative z-10">
        <div className="max-w-[1440px] mx-auto w-full flex justify-center md:justify-center lg:justify-start">
          <div className="pl-4 md:pl-0 lg:pl-[clamp(24px,6vw,120px)]">
            <Image
              src="/assets/images/logoalmia.svg"
              alt="Almia Logo"
              width={150}
              height={48}
              className="object-contain w-[100px] h-[32px] md:w-[120px] md:h-[38px] lg:w-[135px] lg:h-[43px] xl:w-[150px] xl:h-[48px]"
              priority
            />
          </div>
        </div>
      </div>

      {/* Rectángulo con gradiente multicolor que se desvanece hacia arriba */}
      <div className="absolute inset-x-0 bottom-0 h-[500px] md:h-[600px] lg:h-[650px]">
        {/* Gradiente de colores base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, #73439E 0%, #9054C6 25%, #FFE11E 50%, #3BC8B8 75%, #2FA093 100%)',
          }}
        ></div>
        {/* Overlay de desvanecimiento blanco (de opaco arriba a transparente abajo) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, #FFFFFF 0%, rgba(248, 248, 248, 0.96) 28%, rgba(248, 248, 248, 0.72) 50%, rgba(248, 248, 248, 0.5) 72%, rgba(248, 248, 248, 0) 100%)',
          }}
        ></div>
      </div>

      {/* Contenedor principal centrado para contenido y mockup */}
      <div className="relative w-full max-w-[1440px] mx-auto flex-1 flex items-center">
        {/* Mockup del iPhone con iconos flotantes - Columna derecha */}
        <div
          className="absolute z-10 hidden lg:block lg:bottom-[-250px] xl:bottom-[-280px]"
          style={{
            right: '90px',
            width: 'clamp(370px, 42vw, 680px)',
            height: 'clamp(630px, 72vw, 980px)',
          }}
          suppressHydrationWarning
        >
          {/* Contenedor relativo para posicionar iconos flotantes */}
          <div className="relative w-full h-full">
            {/* Mockup del iPhone */}
            <div
              className="absolute"
              style={{
                bottom: '0',
                left: '60%',
                transform: 'translateX(-50%)',
                width: 'clamp(360px, 42vw, 660px)',
                height: 'clamp(580px, 67vw, 930px)',
                zIndex: 1,
              }}
            >
              <Image
                src="/images/iPhone 14 Pro.png"
                alt="iPhone 14 Pro"
                width={630}
                height={930}
                className="w-full h-full object-contain"
                priority
                unoptimized
              />
            </div>

            {/* Iconos flotantes de LinkedIn - diferentes tamaños y posiciones */}
            {/* Icono 1 - Computrabajo, Grande, arriba izquierda */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-125 hover:-translate-y-2"
              style={{
                top: '-5%',
                left: '65%',
                width: 'clamp(48px, 5.67vw, 81px)',
                height: 'clamp(48px, 5.67vw, 81px)',
                backgroundColor: '#F8F8F8',
                borderRadius: '18px',
                padding: '10px',
                boxShadow: '0px 4px 20px rgba(100, 99, 99, 0.25)',
                transform: 'rotate(10deg)',
                zIndex: 15,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0px 8px 30px rgba(144, 84, 198, 0.4)';
                e.currentTarget.style.transform = 'rotate(15deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0px 4px 20px rgba(100, 99, 99, 0.25)';
                e.currentTarget.style.transform = 'rotate(10deg)';
              }}
            >
              <Image
                src="/assets/images/computrabajoLogo.png"
                alt="LinkedIn"
                width={81}
                height={81}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono 2 - Magneto, Mediano, arriba centro */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-125 hover:-translate-y-2"
              style={{
                top: '8%',
                left: '40%',
                width: 'clamp(48px, 5.27vw, 73px)',
                height: 'clamp(48px, 5.27vw, 73px)',
                backgroundColor: '#F8F8F8',
                borderRadius: '14px',
                padding: '8px',
                boxShadow: '0px 4px 20px rgba(100, 99, 99, 0.25)',
                transform: 'rotate(-10deg)',
                zIndex: 15,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0px 8px 30px rgba(144, 84, 198, 0.4)';
                e.currentTarget.style.transform = 'rotate(-15deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0px 4px 20px rgba(100, 99, 99, 0.25)';
                e.currentTarget.style.transform = 'rotate(-10deg)';
              }}
            >
              <Image
                src="/assets/images/MagnetoLogo.jpg"
                alt="Magneto"
                width={61}
                height={61}
                style={{ objectFit: 'cover', borderRadius: '10px', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono 3 - Elempleo, Pequeño, centro izquierda */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-125 hover:-translate-y-2"
              style={{
                top: '39%',
                left: '55%',
                width: 'clamp(36px, 4.05vw, 59px)',
                height: 'clamp(36px, 4.05vw, 59px)',
                backgroundColor: '#F8F8F8',
                borderRadius: '13px',
                padding: '7px',
                boxShadow: '0px 4px 20px rgba(100, 99, 99, 0.25)',
                transform: 'rotate(-15deg)',
                zIndex: 15,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0px 8px 30px rgba(144, 84, 198, 0.4)';
                e.currentTarget.style.transform = 'rotate(-20deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0px 4px 20px rgba(100, 99, 99, 0.25)';
                e.currentTarget.style.transform = 'rotate(-15deg)';
              }}
            >
              <Image
                src="/assets/images/elempleoLogo.png"
                alt="Elempleo"
                width={59}
                height={59}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono 4 - Google Empleos*/}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-125 hover:-translate-y-2"
              style={{
                top: '15%',
                right: '18.9%',
                width: 'clamp(40px, 4.86vw, 65px)',
                height: 'clamp(40px, 4.86vw, 65px)',
                backgroundColor: '#F8F8F8',
                borderRadius: '16px',
                padding: '9px',
                boxShadow: '0px 4px 20px rgba(100, 99, 99, 0.25)',
                transform: 'rotate(8deg)',
                zIndex: 15,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0px 8px 30px rgba(144, 84, 198, 0.4)';
                e.currentTarget.style.transform = 'rotate(12deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0px 4px 20px rgba(100, 99, 99, 0.25)';
                e.currentTarget.style.transform = 'rotate(8deg)';
              }}
            >
              <Image
                src="/assets/images/GoogleLogo.png"
                alt="Google Jobs"
                width={73}
                height={73}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono 5 - LinkedIn, Pequeño, centro arriba */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-125 hover:-translate-y-2"
              style={{
                top: '28%',
                left: '66%',
                width: 'clamp(36px, 4.05vw, 59px)',
                height: 'clamp(36px, 4.05vw, 59px)',
                backgroundColor: '#F8F8F8',
                borderRadius: '13px',
                padding: '7px',
                boxShadow: '0px 4px 20px rgba(100, 99, 99, 0.25)',
                transform: 'translateX(-50%) rotate(18deg)',
                zIndex: 15,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0px 8px 30px rgba(144, 84, 198, 0.4)';
                e.currentTarget.style.transform = 'translateX(-50%) rotate(25deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0px 4px 20px rgba(100, 99, 99, 0.25)';
                e.currentTarget.style.transform = 'translateX(-50%) rotate(18deg)';
              }}
            >
              <Image
                src="/assets/images/linkedin.png"
                alt="LinkedIn"
                width={59}
                height={59}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono Calendario 1 */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-125 hover:-translate-y-2"
              style={{
                top: '22%',
                left: '78%',
                width: 'clamp(59px, 7.65vw, 104px)',
                height: 'clamp(59px, 7.65vw, 104px)',
                transform: 'rotate(-12deg)',
                zIndex: 15,
                filter: 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 6px 20px rgba(144, 84, 198, 0.7))';
                e.currentTarget.style.transform = 'rotate(-8deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))';
                e.currentTarget.style.transform = 'rotate(-12deg)';
              }}
            >
              <Image
                src="/assets/images/calendar.svg"
                alt="Calendario 1"
                width={68}
                height={68}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono Calendario 2 */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-125 hover:-translate-y-2"
              style={{
                top: '3%',
                left: '55%',
                width: 'clamp(68px, 9vw, 122px)',
                height: 'clamp(68px, 9vw, 122px)',
                transform: 'rotate(-15deg)',
                zIndex: 15,
                filter: 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 6px 20px rgba(144, 84, 198, 0.7))';
                e.currentTarget.style.transform = 'rotate(-10deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))';
                e.currentTarget.style.transform = 'rotate(-15deg)';
              }}
            >
              <Image
                src="/assets/images/calendar.svg"
                alt="Calendario 2"
                width={68}
                height={68}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono Calendario 3 */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-125 hover:-translate-y-2"
              style={{
                top: '28%',
                right: '41.4%',
                width: 'clamp(50px, 6.3vw, 86px)',
                height: 'clamp(50px, 6.3vw, 86px)',
                transform: 'rotate(5deg)',
                zIndex: 15,
                filter: 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 6px 20px rgba(144, 84, 198, 0.7))';
                e.currentTarget.style.transform = 'rotate(10deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))';
                e.currentTarget.style.transform = 'rotate(5deg)';
              }}
            >
              <Image
                src="/assets/images/calendar.svg"
                alt="Calendario 3"
                width={68}
                height={68}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono Reloj 1 - Basado en Calendario 1 (mediano) */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-150 hover:-translate-y-2"
              style={{
                top: '20%',
                left: '52%',
                width: 'clamp(20px, 2.52vw, 34px)',
                height: 'clamp(20px, 2.52vw, 34px)',
                transform: 'rotate(0deg)',
                zIndex: 15,
                filter: 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 6px 20px rgba(144, 84, 198, 0.7))';
                e.currentTarget.style.transform = 'rotate(12deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))';
                e.currentTarget.style.transform = 'rotate(0deg)';
              }}
            >
              <Image
                src="/assets/images/clock.svg"
                alt="Reloj 1"
                width={34}
                height={34}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono Reloj 2 - Basado en Calendario 2 (grande) */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-150 hover:-translate-y-2"
              style={{
                top: '5%',
                left: '80%',
                width: 'clamp(23px, 3.06vw, 41px)',
                height: 'clamp(23px, 3.06vw, 41px)',
                transform: 'rotate(0deg)',
                zIndex: 15,
                filter: 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 6px 20px rgba(144, 84, 198, 0.7))';
                e.currentTarget.style.transform = 'rotate(12deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))';
                e.currentTarget.style.transform = 'rotate(0deg)';
              }}
            >
              <Image
                src="/assets/images/clock.svg"
                alt="Reloj 2"
                width={41}
                height={41}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

            {/* Icono Reloj 3 - Basado en Calendario 3 (pequeño) */}
            <div
              className="absolute group cursor-pointer transition-all duration-300 hover:scale-150 hover:-translate-y-2"
              style={{
                top: '35%',
                right: '15%',
                width: 'clamp(16px, 2.07vw, 29px)',
                height: 'clamp(16px, 2.07vw, 29px)',
                transform: 'rotate(12deg)',
                zIndex: 15,
                filter: 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 6px 20px rgba(144, 84, 198, 0.7))';
                e.currentTarget.style.transform = 'rotate(20deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'drop-shadow(0px 4px 20px rgba(100, 99, 99, 0.25))';
                e.currentTarget.style.transform = 'rotate(12deg)';
              }}
            >
              <Image
                src="/assets/images/clock.svg"
                alt="Reloj 3"
                width={29}
                height={29}
                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                className="transition-transform duration-300"
              />
            </div>

          </div>
        </div>

        {/* Contenido principal alineado a la izquierda */}
        <div className="flex-1 flex items-center justify-center pt-8 md:pt-4 md:mt-0 lg:justify-start lg:pt-8 lg:mt-0 xl:pt-16 xl:mt-0 pb-4 md:pb-2 lg:pb-4 xl:pb-14 relative" style={{ paddingLeft: 'clamp(24px, 6vw, 120px)', paddingRight: 'clamp(24px, 6vw, 120px)' }}>
          <div className="max-w-2xl w-full text-center relative z-20 flex flex-col items-center md:max-w-[85%] lg:text-left lg:items-start lg:max-w-[75%] xl:max-w-2xl">
            {/* Texto Superior */}
            <p className="text-xl md:text-[22px] lg:text-[22px] xl:text-[24px] text-[#A6A6A6] font-normal mb-1 text-center lg:text-left">
              CIO
            </p>

            {/* Título Principal */}
            <h1
              className="text-3xl md:text-[36px] lg:text-[38px] xl:text-[54px] font-medium text-black mb-2 max-w-2xl md:max-w-[90%] lg:max-w-[75%] xl:max-w-2xl text-center lg:text-left"
              style={{ lineHeight: '1.5' }}
            >
              EL CAZADOR DE{' '}
              <span className="font-bold text-[#9054C6]">OFERTAS DE EMPLEO</span> MÁS GRANDE DE COLOMBIA.
            </h1>

            {/* Empieza aquí */}
            <p className="text-lg md:text-[18px] lg:text-[20px] xl:text-[30px] text-[#646363] font-normal mb-6 text-center lg:text-left max-w-2xl md:max-w-[85%] lg:max-w-[75%] xl:max-w-2xl"
              style={{ lineHeight: '1.5' }}
            >
              Encuentra empleo sin perder tanto tiempo buscando.
            </p>

            {/* Empieza aquí */}
            <p className="text-lg md:text-[16px] lg:text-[15px] xl:text-xl text-[#646363] font-normal text-center lg:text-left max-w-[600px] md:max-w-[80%] lg:max-w-[70%] xl:max-w-[600px]">
              Todas las ofertas de internet, filtradas y enviadas en segundos directo a tu WhatsApp.
            </p>

            {/* Botón */}
            <div className="flex flex-col gap-3 pt-4 md:pt-5 lg:pt-6 xl:pt-8 w-full items-center lg:items-start">
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

      {/* Cuadro de Estadísticas */}
      <div className="w-full px-4 pb-8 -mt-4 md:mt-0 relative z-10">
        <div className="mx-auto" style={{ maxWidth: '1300px' }}>
          {/* Rectángulo exterior transparente con sombra */}
          <div
            className="w-full rounded-3xl relative flex items-center justify-center"
            style={{
              minHeight: '110px',
              boxShadow: '0px 4px 8px 0px rgba(255, 255, 255, 0.57)',
              padding: '14px 2.04%', // 30.5px / 1498px ≈ 2.04% en cada lado
            }}
          >
            {/* Rectángulo interior con fondo blanco semi-transparente */}
            <div
              className="w-full min-h-[95px] rounded-2xl flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 px-5 md:px-10 py-3 md:py-0"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.73)',
              }}
            >
              {/* Estadística 1 */}
              <div className="flex items-center justify-center gap-2 flex-1 flex-wrap md:flex-nowrap">
                <span className="text-base md:text-lg lg:text-xl xl:text-3xl font-medium text-[#A6A6A6] whitespace-nowrap">
                  +20
                </span>
                <span className="text-[11px] md:text-[10px] lg:text-xs xl:text-sm font-normal text-[#A6A6A6] text-center md:text-left whitespace-nowrap">
                  Plataformas de empleo.
                </span>
              </div>

              {/* Estadística 2 */}
              <div className="flex items-center justify-center gap-2 flex-1 flex-wrap md:flex-nowrap">
                <span className="text-base md:text-lg lg:text-xl xl:text-3xl font-medium text-[#A6A6A6] whitespace-nowrap">
                  95%
                </span>
                <span className="text-[11px] md:text-[10px] lg:text-xs xl:text-sm font-normal text-[#A6A6A6] text-center md:text-left whitespace-nowrap">
                  Match entre las ofertas y tu perfil profesional.
                </span>
              </div>

              {/* Estadística 3 */}
              <div className="flex items-center justify-center gap-2 flex-1 flex-wrap md:flex-nowrap">
                <span className="text-base md:text-lg lg:text-xl xl:text-3xl font-medium text-[#A6A6A6] whitespace-nowrap">
                  3X
                </span>
                <span className="text-[11px] md:text-[10px] lg:text-xs xl:text-sm font-normal text-[#A6A6A6] text-center md:text-left whitespace-nowrap">
                  Más rápida tú busqueda laboral.
                </span>
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
