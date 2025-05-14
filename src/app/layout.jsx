import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Task Master',
  description: '작업 관리 애플리케이션',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
