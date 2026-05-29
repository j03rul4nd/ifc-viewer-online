// ─── TextType ─────────────────────────────────────────────────────────────────
// React Bits TextType — typewriter effect that types, pauses, then deletes and
// cycles through an array of strings.  Uses gsap only for cursor blink; the
// typing itself is driven by setTimeout (no layout thrash).
//
// Dependencies: gsap (already in package.json)
//
// Usage:
//   <TextType
//     text={["Open any .ifc file instantly", "Validate with 38 built-in rules", "Export corrected IFC in one click"]}
//     typingSpeed={60}
//     pauseDuration={1800}
//     showCursor
//     cursorCharacter="|"
//   />

'use client'

import {
  ElementType,
  useEffect,
  useRef,
  useState,
  createElement,
  useMemo,
  useCallback,
} from 'react'
import { gsap } from 'gsap'

export interface TextTypeProps {
  className?: string
  showCursor?: boolean
  hideCursorWhileTyping?: boolean
  cursorCharacter?: string | React.ReactNode
  cursorBlinkDuration?: number
  cursorClassName?: string
  text: string | string[]
  as?: ElementType
  typingSpeed?: number
  initialDelay?: number
  pauseDuration?: number
  deletingSpeed?: number
  loop?: boolean
  textColors?: string[]
  variableSpeed?: { min: number; max: number }
  onSentenceComplete?: (sentence: string, index: number) => void
  startOnVisible?: boolean
  reverseMode?: boolean
}

const TextType = ({
  text,
  as: Component      = 'div',
  typingSpeed        = 50,
  initialDelay       = 0,
  pauseDuration      = 2000,
  deletingSpeed      = 30,
  loop               = true,
  className          = '',
  showCursor         = true,
  hideCursorWhileTyping = false,
  cursorCharacter    = '|',
  cursorClassName    = '',
  cursorBlinkDuration = 0.5,
  textColors         = [],
  variableSpeed,
  onSentenceComplete,
  startOnVisible     = false,
  reverseMode        = false,
  ...props
}: TextTypeProps & React.HTMLAttributes<HTMLElement>) => {
  const [displayedText,   setDisplayedText]   = useState('')
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [isDeleting,       setIsDeleting]       = useState(false)
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [isVisible,        setIsVisible]        = useState(!startOnVisible)

  const cursorRef    = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLElement>(null)

  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text])

  const getRandomSpeed = useCallback(() => {
    if (!variableSpeed) return typingSpeed
    const { min, max } = variableSpeed
    return Math.random() * (max - min) + min
  }, [variableSpeed, typingSpeed])

  const getCurrentTextColor = () => {
    if (textColors.length === 0) return 'inherit'
    return textColors[currentTextIndex % textColors.length]
  }

  // IntersectionObserver for startOnVisible
  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setIsVisible(true)
        })
      },
      { threshold: 0.1 },
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [startOnVisible])

  // Cursor blink via gsap
  useEffect(() => {
    if (showCursor && cursorRef.current) {
      gsap.set(cursorRef.current, { opacity: 1 })
      gsap.to(cursorRef.current, {
        opacity:  0,
        duration: cursorBlinkDuration,
        repeat:   -1,
        yoyo:     true,
        ease:     'power2.inOut',
      })
    }
  }, [showCursor, cursorBlinkDuration])

  // Typing machine
  useEffect(() => {
    if (!isVisible) return

    let timeout: ReturnType<typeof setTimeout>

    const currentText    = textArray[currentTextIndex]
    const processedText  = reverseMode
      ? currentText.split('').reverse().join('')
      : currentText

    const executeTypingAnimation = () => {
      if (isDeleting) {
        if (displayedText === '') {
          setIsDeleting(false)
          if (currentTextIndex === textArray.length - 1 && !loop) return

          if (onSentenceComplete)
            onSentenceComplete(textArray[currentTextIndex], currentTextIndex)

          setCurrentTextIndex((prev) => (prev + 1) % textArray.length)
          setCurrentCharIndex(0)
          timeout = setTimeout(() => {}, pauseDuration)
        } else {
          timeout = setTimeout(() => {
            setDisplayedText((prev) => prev.slice(0, -1))
          }, deletingSpeed)
        }
      } else {
        if (currentCharIndex < processedText.length) {
          timeout = setTimeout(
            () => {
              setDisplayedText((prev) => prev + processedText[currentCharIndex])
              setCurrentCharIndex((prev) => prev + 1)
            },
            variableSpeed ? getRandomSpeed() : typingSpeed,
          )
        } else if (textArray.length >= 1) {
          if (!loop && currentTextIndex === textArray.length - 1) return
          timeout = setTimeout(() => {
            setIsDeleting(true)
          }, pauseDuration)
        }
      }
    }

    if (currentCharIndex === 0 && !isDeleting && displayedText === '') {
      timeout = setTimeout(executeTypingAnimation, initialDelay)
    } else {
      executeTypingAnimation()
    }

    return () => clearTimeout(timeout)
  }, [
    currentCharIndex, displayedText, isDeleting, typingSpeed, deletingSpeed,
    pauseDuration, textArray, currentTextIndex, loop, initialDelay, isVisible,
    reverseMode, variableSpeed, onSentenceComplete, getRandomSpeed,
  ])

  const shouldHideCursor =
    hideCursorWhileTyping &&
    (currentCharIndex < textArray[currentTextIndex].length || isDeleting)

  return createElement(
    Component,
    {
      ref:       containerRef,
      className: `inline-block whitespace-pre-wrap tracking-tight ${className}`,
      ...props,
    },
    <span className="inline" style={{ color: getCurrentTextColor() || 'inherit' }}>
      {displayedText}
    </span>,
    showCursor && (
      <span
        ref={cursorRef}
        className={`ml-1 inline-block opacity-100 ${shouldHideCursor ? 'hidden' : ''} ${cursorClassName}`}
      >
        {cursorCharacter}
      </span>
    ),
  )
}

export default TextType
