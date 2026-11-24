// MathML in JSX: the words' card sets a slide's equation as the 2D app does (`.pz-eq > math`), typeset by the browser.
import 'react';
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      math: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      mrow: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      mi: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      mo: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { form?: "prefix" | "infix" | "postfix"; lspace?: string; rspace?: string };
      msub: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      mn: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      mfrac: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      mspace: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { width?: string };
      mtext: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
