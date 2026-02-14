import * as React from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'

import { cn } from '../../utils'
import { buttonVariants } from './button'

/**
 * Wrapper around AlertDialogPrimitive.Root that delays portal unmount
 * so close animations have time to play. Radix normally unmounts the
 * portal immediately when `open` becomes false, which prevents exit
 * animations from being visible.
 *
 * How it works:
 * - The real `open` prop is always forwarded so Radix sets `data-state`
 *   to "closed" immediately, triggering CSS close animations.
 * - A separate `mounted` state keeps the portal in the DOM for a short
 *   duration after `open` goes false, giving animations time to finish.
 * - When `open` is false and the delay expires, Radix unmounts the portal.
 */
const AlertDialog: React.FC<
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Root>
> = ({ open, children, ...props }) => {
  // `mounted` controls whether the portal stays in the DOM.
  // `open` is forwarded to Radix for data-state/aria attributes.
  const [mounted, setMounted] = React.useState(open ?? false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    if (open) {
      // Opening — cancel any pending unmount and mount immediately.
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setMounted(true)
    } else if (mounted) {
      // Closing — delay unmount so close animations can play.
      // The longest close animation is dialog-scan-out at 200ms.
      timerRef.current = setTimeout(() => {
        setMounted(false)
        timerRef.current = null
      }, 220)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [open, mounted])

  // When `open` is false and unmount delay hasn't expired yet, Radix
  // sees `open=false` → sets data-state="closed" → triggers exit
  // animations. After 220ms, `mounted` flips to false → Radix unmounts.
  // When neither `open` nor `mounted`, nothing renders.
  if (!open && !mounted) return null

  return (
    <AlertDialogPrimitive.Root open={open} {...props}>
      {children}
    </AlertDialogPrimitive.Root>
  )
}
AlertDialog.displayName = 'AlertDialog'

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      'fixed inset-0 z-50 data-[state=closed]:pointer-events-none',
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & {
    /** Additional classes forwarded to the backdrop overlay. */
    overlayClassName?: string
  }
>(({ className, overlayClassName, ...props }, ref) => (
  <AlertDialogPortal forceMount>
    <AlertDialogOverlay className={overlayClassName} />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg data-[state=open]:animate-dialog-scan-in data-[state=closed]:animate-dialog-scan-out data-[state=closed]:pointer-events-none sm:rounded-lg',
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-2 text-center sm:text-left',
      className
    )}
    {...props}
  />
)
AlertDialogHeader.displayName = 'AlertDialogHeader'

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
)
AlertDialogFooter.displayName = 'AlertDialogFooter'

const AlertDialogTitle = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold', className)}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      buttonVariants({ variant: 'outline' }),
      'mt-2 sm:mt-0',
      className
    )}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
