import { useEffect } from 'react'
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react'

type Props = { value: number; format?: (n: number) => string; className?: string }

/** Number that springs to its new value. Respects prefers-reduced-motion. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('en-US'), className }: Props) {
  const reduce = useReducedMotion()
  const spring = useSpring(value, { stiffness: 90, damping: 20, mass: 0.8 })
  const text = useTransform(spring, (v) => format(v))
  useEffect(() => {
    if (reduce) spring.jump(value)
    else spring.set(value)
  }, [value, reduce, spring])
  return <motion.span className={className}>{text}</motion.span>
}
