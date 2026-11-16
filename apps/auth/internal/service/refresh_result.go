package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
)

func refreshAEAD(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func SealRefreshResult(key []byte, purpose string, raw []byte) (string, error) {
	aead, err := refreshAEAD(key)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(aead.Seal(nonce, nonce, raw, []byte("sb0rka:refresh:"+purpose))), nil
}
func OpenRefreshResult(key []byte, purpose, sealed string) ([]byte, error) {
	aead, err := refreshAEAD(key)
	if err != nil {
		return nil, err
	}
	raw, err := base64.RawURLEncoding.DecodeString(sealed)
	if err != nil || len(raw) <= aead.NonceSize() {
		return nil, errors.New("invalid refresh result")
	}
	return aead.Open(nil, raw[:aead.NonceSize()], raw[aead.NonceSize():], []byte("sb0rka:refresh:"+purpose))
}
