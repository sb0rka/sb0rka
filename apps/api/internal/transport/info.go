package transport

import (
	"encoding/json"
	"net/http"
)

// Info godoc
// @Summary Информация о сборке API
// @Description Возвращает версию, редакцию и тип размещения Platform API.
// @Tags system
// @Produce json
// @Success 200 {object} contract.InfoResponse
// @Router /info [get]
func (s *Server) info(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(s.deps.Info); err != nil {
		s.deps.Log.ErrorContext(r.Context(), "write_info_response_failed", "error", err)
	}
}
