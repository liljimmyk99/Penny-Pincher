package auth

import (
	"context"
	"fmt"
	"net/http"
)

// keysURL serves the public keys Firebase signs ID tokens with. If it can't be
// reached, new tokens can't be verified once the cached keys expire.
const keysURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

// ProbeProvider checks that the sign-in provider's signing keys are reachable.
func ProbeProvider(ctx context.Context) error {
	return probe(ctx, http.DefaultClient, keysURL)
}

func probe(ctx context.Context, c *http.Client, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("provider returned %d", resp.StatusCode)
	}
	return nil
}
