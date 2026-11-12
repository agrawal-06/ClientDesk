import type { Metadata } from 'next';
import './globals.css';
import './desk-theme.css';
export const metadata:Metadata={title:'ClientDesk — Your freelance workspace',description:'A focused workspace for freelance clients, projects, tasks and payment records.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
