export default function LoadingSpinner() {
  return (
    <div
      data-testid="loading"
      role="status"
      aria-label="Loading"
      className="flex justify-center py-16"
    >
      <div className="w-8 h-8 rounded-full border-2 border-bone border-t-leaf animate-spin" />
    </div>
  )
}
