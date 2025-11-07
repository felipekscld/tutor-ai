// web/src/components/__tests__/LoginScreen.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginScreen from '../LoginScreen';

describe('LoginScreen', () => {
  it('should render login button', () => {
    const mockOnLogin = vi.fn();
    render(<LoginScreen onLogin={mockOnLogin} />);
    
    const button = screen.getByText(/Entrar com Google/i);
    expect(button).toBeInTheDocument();
  });

  it('should call onLogin when button is clicked', () => {
    const mockOnLogin = vi.fn();
    render(<LoginScreen onLogin={mockOnLogin} />);
    
    const button = screen.getByText(/Entrar com Google/i);
    fireEvent.click(button);
    
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
  });

  it('should render theme toggle button', () => {
    const mockOnLogin = vi.fn();
    render(<LoginScreen onLogin={mockOnLogin} />);
    
    const themeButton = screen.getByText(/Escuro/i);
    expect(themeButton).toBeInTheDocument();
  });

  it('should toggle theme when clicked', () => {
    const mockOnLogin = vi.fn();
    render(<LoginScreen onLogin={mockOnLogin} />);
    
    const themeButton = screen.getByText(/Escuro/i);
    fireEvent.click(themeButton);
    
    // After click, should show "Claro"
    expect(screen.getByText(/Claro/i)).toBeInTheDocument();
  });
});

