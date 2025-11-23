export default function NotFound() {
  console.log('api url', process.env.NEXT_PUBLIC_API_URL);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center space-y-4 items-center justify-center">
        <h1 className="text-4xl font-bold text-center">404 - Página no encontrada</h1>
        <p className="text-lg text-muted-foreground text-center">La página que estás buscando no existe.</p>
      </div>
    </div>
  );
}
