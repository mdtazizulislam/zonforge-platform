import React from 'react'

type AuthCardProps = {
  heading: string
  description: string
  children: React.ReactNode
}

export default function AuthCard({ heading, description, children }: AuthCardProps) {
  return (
    <div className="zf-auth-card">
      <h1>{heading}</h1>
      <p>{description}</p>
      {children}
    </div>
  )
}