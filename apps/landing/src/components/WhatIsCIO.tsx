'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

export default function WhatIsCIO() {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // URL del video - cambiar cuando esté disponible
  const videoSrc = ''; // Agregar URL del video aquí

  const handlePlayClick = () => {
    if (videoRef.current && videoSrc) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <section className="py-16 md:py-24 px-4 bg-white relative overflow-hidden">
      {/* Ícono de click izquierdo */}
      <div
        className="absolute hidden md:block"
        style={{
          left: '5%',
          bottom: '15%',
          width: 'clamp(80px, 10vw, 126px)',
          height: 'clamp(82px, 10.3vw, 130px)',
          transform: 'rotate(-15deg)',
        }}
      >
        <Image
          src="/assets/vectors/click.svg"
          alt="Click icon"
          width={126}
          height={130}
          style={{ objectFit: 'contain', width: '100%', height: '100%' }}
        />
      </div>

      {/* Ícono de click derecho */}
      <div
        className="absolute hidden md:block"
        style={{
          right: '5%',
          top: '25%',
          width: 'clamp(80px, 10vw, 126px)',
          height: 'clamp(82px, 10.3vw, 130px)',
          transform: 'rotate(15deg) scaleX(-1)',
        }}
      >
        <Image
          src="/assets/vectors/click.svg"
          alt="Click icon"
          width={126}
          height={130}
          style={{ objectFit: 'contain', width: '100%', height: '100%' }}
        />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Título */}
        <h2 className="text-3xl md:text-5xl font-bold text-gray-900 text-center mb-6">
          ¿Qué es CIO?
        </h2>

        {/* Descripción principal */}
        <p className="text-base md:text-lg text-gray-500 text-center max-w-3xl mx-auto mb-4 leading-relaxed">
          El Cazador Inteligente de Oportunidades es una herramienta con IA para encontrar trabajo sin
          esfuerzo. Analiza tu perfil, entiende tu experiencia y rastrea todas las plataformas laborales para
          enviarte a tu WhatsApp, todas las vacantes que realmente encajan contigo.
        </p>

        {/* Subtexto */}
        <p className="text-base md:text-lg text-gray-500 text-center mb-12">
          Sin perder tiempo. Sin estrés. Sin repetir búsquedas infinitas.
        </p>

        {/* Contenedor de video */}
        <div className="relative w-full max-w-3xl mx-auto aspect-video rounded-2xl overflow-hidden bg-[#9054C6] shadow-xl">
          {videoSrc ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                src={videoSrc}
                onEnded={() => setIsPlaying(false)}
                playsInline
              >
                Tu navegador no soporta el elemento de video.
              </video>
              {/* Botón de play overlay */}
              {!isPlaying && (
                <button
                  onClick={handlePlayClick}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors duration-300 group"
                  aria-label="Reproducir video"
                >
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <svg
                      className="w-8 h-8 md:w-10 md:h-10 text-white ml-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </button>
              )}
            </>
          ) : (
            /* Placeholder cuando no hay video */
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-transform duration-300 cursor-pointer"
                aria-label="Video próximamente"
              >
                <svg
                  className="w-8 h-8 md:w-10 md:h-10 text-white/70 ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

