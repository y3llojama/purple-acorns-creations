import Script from 'next/script'

const squareSrc = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://web.squarecdn.com/v1/square.js'
  : 'https://sandbox.web.squarecdn.com/v1/square.js'

export default function PrivateSaleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Script src={squareSrc} strategy="beforeInteractive" />
    </>
  )
}
