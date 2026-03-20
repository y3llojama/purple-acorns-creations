import Script from 'next/script'
import { CartProvider } from '@/components/shop/CartContext'
import CartDrawer from '@/components/shop/CartDrawer'

const squareSrc = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://web.squarecdn.com/v1/square.js'
  : 'https://sandbox.web.squarecdn.com/v1/square.js'

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
      <CartDrawer />
      <Script src={squareSrc} strategy="beforeInteractive" />
      <Script src="//assets.pinterest.com/js/pinit.js" strategy="lazyOnload" />
    </CartProvider>
  )
}
