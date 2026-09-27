import { useEffect } from 'react'
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react'

type Props = { value: number; format?: (n: number) => string; className?: string; fast?: boolean }

const SPRING = { stiffness: 90, damping: 20, mass: 0.8 }
/** Settles in about 0.3 s, for panels that update while a control is being dragged. */
const SPRING_FAST = { stiffness: 400, damping: 32, mass: 0.5 }

/** Number that springs to its new value. Respects prefers-reduced-motion. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('en-US'), className, fast }: Props) {
  const reduce = useReducedMotion()
  const spring = useSpring(value, fast ? SPRING_FAST : SPRING)
  const text = useTransform(spring, (v) => format(v))
  useEffect(() => {
    if (reduce) spring.jump(value)
    else spring.set(value)
  }, [value, reduce, spring])
  return <motion.span className={className}>{text}</motion.span>
}
