export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 border-4 border-almia-purple-light rounded-full animate-ping opacity-75" />
          <div className="absolute inset-0 border-4 border-almia-purple-dark border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-admin-text-secondary">Cargando...</p>
      </div>
    </div>
  );
}

