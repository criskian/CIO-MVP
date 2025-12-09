'use client';

import { useEffect } from 'react';
import RegistrationForm from './RegistrationForm';

interface RegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function RegistrationModal({ isOpen, onClose }: RegistrationModalProps) {
    // Bloquear scroll del body cuando el modal está abierto
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Cerrar con tecla Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            {/* Backdrop con blur y tono morado */}
            <div
                className="absolute inset-0 bg-[#9054C6]/30 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="sticky top-0 bg-white px-6 py-5 border-b border-gray-200 flex items-center justify-between rounded-t-2xl">
                    <div>
                        <h2 className="font-poppins text-2xl font-bold text-gray-900">
                            Regístrate en CIO
                        </h2>
                        <p className="font-poppins text-sm text-gray-500 mt-1">
                            Comienza tu búsqueda de empleo
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
                        aria-label="Cerrar modal"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <RegistrationForm onSuccess={onClose} onClose={onClose} />
            </div>
        </div>
    );
}
