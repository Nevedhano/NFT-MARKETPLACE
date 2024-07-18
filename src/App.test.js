import { render, screen } from '@testing-library/react';
import NFTImageFetcher from './NFTImageFetcher';

test('renders NFT MARKETPLACE heading', () => {
  render(<NFTImageFetcher />);
  const headingElement = screen.getByText(/NFT MARKETPLACE/i);
  expect(headingElement).toBeInTheDocument();
});

