import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card'
import { Button } from './button'

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    className: { control: 'text' },
  },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>
          Optional description text for context.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          This is the card content area. Use it to place body text, forms, or
          any custom content.
        </p>
      </CardContent>
      <CardFooter>
        <Button>Primary Action</Button>
      </CardFooter>
    </Card>
  ),
}

export const WithCustomStyles: Story = {
  args: {
    className: 'border-primary/50 shadow-md bg-red-500',
  },
  render: (args) => (
    <Card {...args}>
      <CardHeader className="p-4">
        <CardTitle className="text-lg">Compact Header</CardTitle>
        <CardDescription className="text-xs">
          Custom header spacing and sizes via className
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <p className="text-sm">
          You can also override spacing on sections with their own className.
        </p>
      </CardContent>
      <CardFooter className="p-4">
        <Button variant="destructive">Secondary Action</Button>
      </CardFooter>
    </Card>
  ),
}
